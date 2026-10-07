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
  StoreAsaasNotReadyError,
} from '../services/asaasLoja/account';

/** Corpo do PUT: só valida formato bruto; o prefixo/ambiente é conferido no service. */
export const connectSchema = z.object({ apiKey: z.string().trim().min(10).max(200) }).strict();
export const checklistSchema = z
  .object({ ipWhitelist: z.boolean().optional(), authWebhook: z.boolean().optional() })
  .strict();

/**
 * Webhook de autorização de transferências: o endpoint que recebe o Asaas só existe na
 * Fase 2. Até lá a geração de token fica desligada (404 FEATURE_NOT_AVAILABLE) e o item
 * 4 do checklist não aparece na tela nem é exigido.
 */
const AUTH_WEBHOOK_AVAILABLE = false;

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
  const status = await connectStoreAsaas(req.params.storeId, req.body.apiKey, (req as any).user?.id);
  ok(res, status);
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
