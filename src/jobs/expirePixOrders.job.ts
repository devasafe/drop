import env from '../config/env';
import logger from '../config/logger';
import { expireStalePixOrders } from '../services/asaas/expireOrders';

/**
 * Job de varredura que expira pedidos PIX não pagos (devolve estoque).
 * Só roda quando o gateway Asaas está ativo. Roda a cada 5 minutos.
 */
export function startExpirePixOrdersJob(): void {
  if (env.PAYMENT_GATEWAY !== 'asaas') {
    logger.info('[expirePixOrders] gateway != asaas — job não iniciado');
    return;
  }

  const INTERVAL_MS = 5 * 60 * 1000; // 5 min
  setInterval(() => {
    expireStalePixOrders().catch((err) => logger.error('[expirePixOrders] falha na varredura', err as Error));
  }, INTERVAL_MS);

  logger.info('[expirePixOrders] job iniciado (varredura a cada 5 min)');
}

export default startExpirePixOrdersJob;
