import env from '../config/env';
import logger from '../config/logger';
import { expireStalePixOrders } from '../services/asaas/expireOrders';

/**
 * Uma varredura. Gateway Asaas (custódia) ativo → expira todos os pedidos PIX vencidos,
 * cada um pelo seu provedor. Sem gateway Asaas → só os do modo direto ('asaas_loja'):
 * o modo é config de plataforma e pode mudar em runtime, e pedidos diretos já criados
 * precisam expirar mesmo depois de voltar para custódia (consulta barata se não houver).
 */
export async function expirePixOrdersTick(): Promise<number> {
  if (env.PAYMENT_GATEWAY === 'asaas') return expireStalePixOrders();
  return expireStalePixOrders({ onlyDirect: true });
}

/**
 * Job de varredura que expira pedidos PIX não pagos (devolve estoque). Roda a cada 5 minutos,
 * na custódia (PAYMENT_GATEWAY=asaas) e no modo SaaS direto (cobrança na conta da loja).
 */
export function startExpirePixOrdersJob(): void {
  const INTERVAL_MS = 5 * 60 * 1000; // 5 min
  setInterval(() => {
    expirePixOrdersTick().catch((err) => logger.error('[expirePixOrders] falha na varredura', err as Error));
  }, INTERVAL_MS);

  logger.info('[expirePixOrders] job iniciado (varredura a cada 5 min)', { gateway: env.PAYMENT_GATEWAY });
}

export default startExpirePixOrdersJob;
