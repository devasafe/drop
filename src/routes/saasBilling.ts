import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { catchAsync } from '../middleware/errorHandler';
import { requireSettlement } from '../middleware/requireSettlement';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { getSaasConfig } from '../utils/settlement';
import { isStoreOwner } from '../utils/storeOwnership';
import { effectiveFee, isBillingBlocked } from '../services/saasBilling/policy';
import { SAAS_PAID_STATUSES } from '../services/saasBilling/payments';
import { updateSubscriptionValue, deleteSubscription } from '../services/asaas/subscription';

/**
 * Mensalidade SaaS (modo direto).
 *  - adminSaasBillingRouter, montado em /api/admin/stores: lista e valor especial (CEO).
 *  - storeSaasBillingRouter, montado em /api/stores/:storeId/saas-billing: o dono vê a própria.
 * Guards em CADA rota (mesmo motivo de adminStoreAsaas.ts: não interceptar outros /admin/stores/*).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const num = (v: any) => (v == null ? null : Number(v));
const isCeo = (req: any) => (req.user?.activeRole || req.user?.role) === 'ceo';

/** Garante a linha da loja (cria em trialing se faltar; storeId é unique). */
async function ensureBillingRow(storeId: string) {
  const cfg = await getSaasConfig();
  return prisma.storeSaasBilling.upsert({
    where: { storeId },
    create: { storeId, status: 'trialing', trialEndsAt: new Date(Date.now() + cfg.saasTrialDays * DAY_MS) },
    update: {},
  });
}

export const customFeeSchema = z.object({
  customFee: z.number().min(0).max(100000).nullable(),
});

export const adminSaasBillingRouter = Router();

// GET /api/admin/stores/saas-billing — todas as lojas com a situação da mensalidade (B4).
adminSaasBillingRouter.get('/saas-billing', authenticate, authorizePermission('settings:manage'), catchAsync(async (_req: Request, res: Response) => {
  const cfg = await getSaasConfig();
  const now = new Date();
  const stores = await prisma.store.findMany({
    select: { id: true, name: true, saasBilling: true },
    orderBy: { name: 'asc' },
  });
  const data = stores.map((s) => {
    const b = s.saasBilling;
    return {
      storeId: s.id,
      storeName: s.name,
      status: b?.status ?? null,
      trialEndsAt: b?.trialEndsAt ?? null,
      paidUntil: b?.paidUntil ?? null,
      customFee: num(b?.customFee),
      fee: effectiveFee(b, cfg),
      hasSubscription: !!b?.asaasSubscriptionId,
      blocked: !!b && (b.status === 'paused' || isBillingBlocked(b, now, cfg.saasGraceDays)),
    };
  });
  res.json({ success: true, data });
}));

// PUT /api/admin/stores/:storeId/saas-billing — valor especial (null = volta ao padrão; 0 = isenta).
// Fail closed: o Asaas é atualizado ANTES de gravar; se falhar → 502 e nada muda.
adminSaasBillingRouter.put('/:storeId/saas-billing', authenticate, authorizePermission('settings:manage'), validate(customFeeSchema), catchAsync(async (req: any, res: Response) => {
  if (!isCeo(req)) return res.status(403).json({ error: 'Apenas o CEO define o valor especial da mensalidade', code: 'CEO_ONLY' });
  const { storeId } = req.params;
  const store = await prisma.store.findUnique({ where: { id: String(storeId) }, select: { id: true } });
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

  const cfg = await getSaasConfig();
  const billing = await ensureBillingRow(store.id);
  const customFee: number | null = req.body.customFee;
  const from = num(billing.customFee);
  const fee = effectiveFee({ customFee }, cfg);

  // Fee 0 com assinatura: apaga a assinatura (o Asaas não cobra valor zero); o job só recria
  // quando o fee voltar a ser > 0.
  let clearSubscription = false;
  if (billing.asaasSubscriptionId) {
    try {
      if (fee > 0) await updateSubscriptionValue(billing.asaasSubscriptionId, fee);
      else {
        await deleteSubscription(billing.asaasSubscriptionId);
        clearSubscription = true;
      }
    } catch (err) {
      logger.error('[saas-billing] Asaas recusou a alteração do valor especial', err as Error, { storeId: store.id });
      return res.status(502).json({ error: 'Não foi possível atualizar a assinatura no Asaas. Nada foi alterado.', code: 'ASAAS_UPDATE_FAILED' });
    }
  }

  const saved = await prisma.storeSaasBilling.update({
    where: { id: billing.id },
    data: { customFee, ...(clearSubscription ? { asaasSubscriptionId: null } : {}) },
  });
  logger.info('[saas-billing][AUDIT] valor especial', { by: req.user?.id, storeId: store.id, from, to: customFee });
  return res.json({
    success: true,
    data: { storeId: store.id, customFee: num(saved.customFee), fee, hasSubscription: !!saved.asaasSubscriptionId },
  });
}));

export const storeSaasBillingRouter = Router({ mergeParams: true });

// GET /api/stores/:storeId/saas-billing — só o dono, só no modo direto.
storeSaasBillingRouter.get('/', authenticate, requireSettlement('direto'), catchAsync(async (req: any, res: Response) => {
  const { storeId } = req.params;
  if (!(await isStoreOwner(storeId, req.user?.id))) {
    return res.status(403).json({ error: 'Você não tem acesso a esta loja', code: 'STORE_FORBIDDEN' });
  }
  const cfg = await getSaasConfig();
  const billing = await ensureBillingRow(String(storeId));
  const unpaid = await prisma.saasBillingPayment.findFirst({
    where: { billingId: billing.id, status: { notIn: SAAS_PAID_STATUSES } },
    orderBy: { dueDate: 'desc' },
  });
  const p = unpaid || await prisma.saasBillingPayment.findFirst({ where: { billingId: billing.id }, orderBy: { dueDate: 'desc' } });
  return res.json({
    success: true,
    data: {
      status: billing.status,
      trialEndsAt: billing.trialEndsAt,
      paidUntil: billing.paidUntil,
      fee: effectiveFee(billing, cfg),
      nextPayment: p ? { dueDate: p.dueDate, value: Number(p.value), invoiceUrl: p.invoiceUrl, status: p.status } : null,
      blocked: billing.status === 'paused' || isBillingBlocked(billing, new Date(), cfg.saasGraceDays),
    },
  });
}));
