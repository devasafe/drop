import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import asaasClient, { AsaasApiError } from '../services/asaas/client';
import { AppError } from '../utils/AppError';
import { isStoreOwner } from '../utils/storeOwnership';
import {
  connectStoreAsaas,
  getStoreApiKey,
  getStoreAsaasStatus,
  StoreAsaasNotReadyError,
} from '../services/asaasLoja/account';

/** Corpo do PUT: só valida formato bruto; o prefixo/ambiente é conferido no service. */
export const connectSchema = z.object({ apiKey: z.string().trim().min(10).max(200) }).strict();
export const checklistSchema = z
  .object({ ipWhitelist: z.boolean().optional(), authWebhook: z.boolean().optional() })
  .strict();

const AUTH_URL_BASE = 'https://api.dropapp.com.br/webhooks/asaas/loja';

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
  const status = await connectStoreAsaas(req.params.storeId, req.body.apiKey);
  ok(res, status);
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
  ok(res, { token, url: `${AUTH_URL_BASE}/${storeId}/autorizacao` });
}

/** "Testar configuração": chave (saldo) + webhook de pagamentos; IP e autorização são confirmação manual. */
export async function postTest(req: Request, res: Response) {
  const { storeId } = req.params;
  const key = await getStoreApiKey(storeId).catch(async (err) => {
    // linha 'invalid' também cai aqui: o teste deve mostrar o estado, não 409
    if (err instanceof StoreAsaasNotReadyError && (await prisma.storeAsaasAccount.findUnique({ where: { storeId } }))) return null;
    throw err;
  });

  let apiKeyOk = false;
  if (key) {
    try {
      await asaasClient.getAs(key, '/finance/balance');
      apiKeyOk = true;
      await prisma.storeAsaasAccount.update({ where: { storeId }, data: { status: 'valid', lastCheckedAt: new Date(), lastError: null } });
    } catch (err: any) {
      if (err instanceof AsaasApiError && err.status === 401) {
        await prisma.storeAsaasAccount.update({
          where: { storeId },
          data: { status: 'invalid', lastCheckedAt: new Date(), lastError: 'Chave recusada pelo Asaas' },
        });
      } else {
        throw new AppError('Não foi possível falar com o Asaas agora. Tente novamente.', 503, true, 'ASAAS_UNAVAILABLE');
      }
    }
  }

  let paymentWebhook = false;
  const row = await prisma.storeAsaasAccount.findUnique({ where: { storeId } });
  if (apiKeyOk && key && row?.paymentWebhookId) {
    try {
      const wh: any = await asaasClient.getAs(key, `/webhooks/${encodeURIComponent(row.paymentWebhookId)}`);
      paymentWebhook = !!wh && wh.enabled === true && wh.interrupted !== true;
    } catch {
      paymentWebhook = false;
    }
  }

  const status = await getStoreAsaasStatus(storeId);
  ok(res, { ...status, checklist: { ...status.checklist, apiKey: apiKeyOk, paymentWebhook } });
}
