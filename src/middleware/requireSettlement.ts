import { Request, Response, NextFunction } from 'express';
import { getSaasConfig, SettlementMode } from '../utils/settlement';
import logger from '../config/logger';

/**
 * Libera a rota só no modo de liquidação indicado (ex.: 'custodia').
 * Em outro modo → 404 FEATURE_DISABLED. Fail closed: erro ao ler a config → 503.
 */
export const requireSettlement = (mode: SettlementMode) =>
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if ((await getSaasConfig()).settlementMode !== mode) {
        return res.status(404).json({ error: 'Função indisponível neste modo de operação', code: 'FEATURE_DISABLED' });
      }
      return next();
    } catch (err) {
      logger.error('requireSettlement: falha ao ler configuração', err as Error);
      return res.status(503).json({ error: 'Configuração indisponível' });
    }
  };
