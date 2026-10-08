import { Request, Response, NextFunction } from 'express';
import { getSaasConfig, SettlementMode } from '../utils/settlement';
import { hasCustodyLeftover } from '../services/custodyLeftover';
import logger from '../config/logger';
import { prisma } from '../lib/prisma';

const featureDisabled = (res: Response) =>
  res.status(404).json({ error: 'Função indisponível neste modo de operação', code: 'FEATURE_DISABLED' });

/**
 * Libera a rota só no modo de liquidação indicado (ex.: 'custodia').
 * Em outro modo → 404 FEATURE_DISABLED. Fail closed: erro ao ler a config → 503.
 */
export const requireSettlement = (mode: SettlementMode) =>
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if ((await getSaasConfig()).settlementMode !== mode) return featureDisabled(res);
      return next();
    } catch (err) {
      logger.error('requireSettlement: falha ao ler configuração', err as Error);
      return res.status(503).json({ error: 'Configuração indisponível' });
    }
  };

/**
 * Rotas de custódia de VER extrato e SACAR (P16: o saldo termina no modo em que nasceu).
 * Na custódia → libera. No modo direto → libera só para quem ainda tem saldo da custódia
 * (repasse em aberto ou carteira com saldo); sem saldo → 404 como `requireSettlement`.
 * Vai DEPOIS de `authenticate`. Nunca usar em rota que cria dinheiro novo de custódia
 * (recarga, transferência entre carteiras) — essas continuam em `requireSettlement`.
 * Fail closed: erro ao ler a config → 503; erro ao consultar o saldo → 404.
 */
export const requireCustodyOrLeftover = async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
  let mode: SettlementMode;
  try {
    mode = (await getSaasConfig()).settlementMode;
  } catch (err) {
    logger.error('requireCustodyOrLeftover: falha ao ler configuração', err as Error);
    return res.status(503).json({ error: 'Configuração indisponível' });
  }
  if (mode === 'custodia') return next();

  const userId = req.user?.id;
  if (!userId) return featureDisabled(res);
  try {
    if (await hasCustodyLeftover(String(userId))) return next();
  } catch (err) {
    logger.error('requireCustodyOrLeftover: falha ao consultar saldo de custódia', err as Error);
  }
  return featureDisabled(res);
};

/**
 * Ruling R23 — `transfer-to-owner` (loja → carteira user do dono; motoboy → própria carteira
 * user) no modo direto. Vai DEPOIS de `authenticate` e `requireCustodyOrLeftover`.
 * Na custódia → libera (comportamento antigo). No modo direto → só o dono da origem
 * (senão 403) e só se a carteira de origem tem saldo transferível (Payout `released`);
 * sem saldo → 404 como as demais rotas de custódia. O dinheiro não sai da plataforma: só
 * muda de carteira do MESMO usuário (nunca dinheiro novo). Fail closed: erro → 503/404.
 */
export const requireOwnerTransferSource = (kind: 'store' | 'motoboy') =>
  async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
    let mode: SettlementMode;
    try {
      mode = (await getSaasConfig()).settlementMode;
    } catch (err) {
      logger.error('requireOwnerTransferSource: falha ao ler configuração', err as Error);
      return res.status(503).json({ error: 'Configuração indisponível' });
    }
    if (mode === 'custodia') return next();

    const userId = String(req.user?.id || '');
    if (!userId) return featureDisabled(res);
    try {
      const recipientId = kind === 'store' ? String(req.params.storeId) : String(req.params.motoboyId);
      if (kind === 'store') {
        const store = await prisma.store.findUnique({ where: { id: recipientId }, select: { ownerId: true } });
        if (!store) return featureDisabled(res);
        if (String(store.ownerId) !== userId) return res.status(403).json({ error: 'Apenas o dono da loja pode transferir' });
      } else if (recipientId !== userId) {
        return res.status(403).json({ error: 'Apenas o próprio motoboy pode transferir' });
      }
      const agg = await prisma.payout.aggregate({
        where: { recipientType: kind, recipientId, status: 'released' },
        _sum: { amount: true },
      });
      if (Number(agg._sum.amount || 0) > 0) return next();
    } catch (err) {
      logger.error('requireOwnerTransferSource: falha ao consultar saldo da origem', err as Error);
    }
    return featureDisabled(res);
  };
