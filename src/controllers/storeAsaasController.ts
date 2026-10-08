import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import env from '../config/env';
import { AppError } from '../utils/AppError';
import { isStoreOwner } from '../utils/storeOwnership';
import {
  connectStoreAsaas,
  disconnectStoreAsaas,
  listStoresAsaas,
  testStoreAsaas,
  getStoreAsaasStatus,
  recordStoreConsent,
  StoreAsaasNotReadyError,
} from '../services/asaasLoja/account';

/** Corpo do PUT: só valida formato bruto; o prefixo/ambiente é conferido no service. */
export const connectSchema = z
  .object({ apiKey: z.string().trim().min(10).max(200), acceptTerms: z.boolean().optional() })
  .strict();
export const consentSchema = z.object({ acceptTerms: z.boolean().optional() }).strict();

/** Termo exige `acceptTerms: true` explícito (lojista clica; admin atesta assinatura presencial). */
function assertTermsAccepted(body: { acceptTerms?: boolean }) {
  if (body.acceptTerms !== true) {
    throw new AppError('É preciso aceitar o termo de autorização para conectar a conta Asaas', 400, true, 'TERMS_NOT_ACCEPTED');
  }
}

/** Quem aceitou e de onde. Rota /api/admin = admin (CEO); o resto é o dono da loja. */
function consentContext(req: Request) {
  const actorRole: 'lojista' | 'admin' = req.baseUrl.startsWith('/api/admin/') ? 'admin' : 'lojista';
  return { ip: req.ip || null, userAgent: req.get('user-agent') || null, actorRole };
}
export const checklistSchema = z
  .object({ ipWhitelist: z.boolean().optional(), authWebhook: z.boolean().optional() })
  .strict();

/**
 * Webhook de autorização de transferências: o endpoint que recebe o Asaas existe desde a
 * Fase 2 (transferAuthController). Mantido como chave de desligamento (404 se false).
 */
const AUTH_WEBHOOK_AVAILABLE = true;

/** URL do webhook de autorização da loja (base pública da API, sem barra no fim). */
export function authWebhookUrl(storeId: string): string {
  const base = String(env.PUBLIC_API_URL || 'https://api.dropapp.com.br').replace(/\/+$/, '');
  return `${base}/webhooks/asaas/loja/${storeId}/autorizacao`;
}

/** Acesso: usuário autenticado precisa ser o dono da loja. Fail closed (loja inexistente → 403). */
export async function requireStoreOwner(req: Request, _res: Response, next: NextFunction) {
  try {
    const userId = (req as any).user?.id;
    if (!(await isStoreOwner(req.params.storeId, userId))) {
      throw new AppError('Você não tem acesso a esta loja', 403, true, 'STORE_FORBIDDEN');
    }
    next();
  } catch (err) {
    next(err);
  }
}

const ok = (res: Response, data: unknown) => res.json({ success: true, data });

export async function putAsaas(req: Request, res: Response) {
  assertTermsAccepted(req.body);
  const status = await connectStoreAsaas(req.params.storeId, req.body.apiKey, (req as any).user?.id, consentContext(req));
  ok(res, status);
}

/** Aceite avulso (conta conectada antes do termo, ou nova versão). Exige conta existente. */
export async function postConsent(req: Request, res: Response) {
  assertTermsAccepted(req.body);
  const { storeId } = req.params;
  await requireAccount(storeId);
  await recordStoreConsent({ storeId, actorId: (req as any).user?.id, ...consentContext(req) });
  ok(res, await getStoreAsaasStatus(storeId));
}

export async function deleteAsaas(req: Request, res: Response) {
  ok(res, await disconnectStoreAsaas(req.params.storeId, (req as any).user?.id));
}

export async function listAsaasStores(_req: Request, res: Response) {
  ok(res, await listStoresAsaas());
}

export async function getAsaas(req: Request, res: Response) {
  ok(res, await getStoreAsaasStatus(req.params.storeId));
}

async function requireAccount(storeId: string) {
  const row = await prisma.storeAsaasAccount.findUnique({ where: { storeId }, select: { id: true } });
  if (!row) throw new StoreAsaasNotReadyError();
}

export async function postChecklist(req: Request, res: Response) {
  const { storeId } = req.params;
  await requireAccount(storeId);
  const { ipWhitelist, authWebhook } = req.body as { ipWhitelist?: boolean; authWebhook?: boolean };
  const data: Record<string, Date | null> = {};
  if (ipWhitelist !== undefined) data.ipWhitelistConfirmedAt = ipWhitelist ? new Date() : null;
  if (authWebhook !== undefined) data.authWebhookConfirmedAt = authWebhook ? new Date() : null;
  if (Object.keys(data).length) await prisma.storeAsaasAccount.update({ where: { storeId }, data });
  ok(res, await getStoreAsaasStatus(storeId));
}

/** Gera/rotaciona o token do webhook de autorização. Em claro só nesta resposta; no banco, só o hash. */
export async function postAuthToken(req: Request, res: Response) {
  if (!AUTH_WEBHOOK_AVAILABLE) {
    throw new AppError('Autorização de transferências ainda não está disponível', 404, true, 'FEATURE_NOT_AVAILABLE');
  }
  const { storeId } = req.params;
  await requireAccount(storeId);
  const token = crypto.randomBytes(24).toString('hex'); // 48 chars hex
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  await prisma.storeAsaasAccount.update({
    where: { storeId },
    // novo token: o lojista precisa colar no Asaas de novo, então a confirmação antiga cai
    data: { authWebhookTokenHash: hash, authWebhookConfirmedAt: null },
  });
  res.set('Cache-Control', 'no-store');
  ok(res, { token, url: authWebhookUrl(storeId) });
}

/** "Testar configuração": a lógica (e a chave) ficam em services/asaasLoja; aqui só HTTP. */
export async function postTest(req: Request, res: Response) {
  ok(res, await testStoreAsaas(req.params.storeId));
}
