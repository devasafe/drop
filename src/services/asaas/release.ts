import asaasClient from './client';
import logger from '../../config/logger';
import Payout from '../../models/Payout';
import Store from '../../models/Store';
import User from '../../models/User';
import payoutService from '../payout.service';
import { Types } from 'mongoose';

/**
 * Liberação na entrega (Fase 3).
 *
 * Custódia: o dinheiro está retido na conta-mãe Asaas. Ao confirmar a entrega
 * (PIN), transferimos internamente p/ as subcontas dos recebedores:
 *   - Payout 'store'   → Store.asaas.walletId  (storeAmount)
 *   - Payout 'motoboy' → User.asaas.walletId   (motoboyAmount)
 *
 * Cada transferência bem-sucedida marca o Payout como 'released' (espelho).
 * Se a subconta não existir ou a transferência falhar, o Payout fica 'pending'
 * (escala pro admin liberar manualmente) — a entrega NÃO quebra por isso.
 *
 * Idempotente: só processa Payouts ainda 'pending' (os já 'released' são pulados).
 */

interface AsaasTransfer {
  id: string;
  status: string;
}

async function resolveWalletId(payout: any): Promise<string | null> {
  if (payout.recipientType === 'store') {
    const store = await Store.findById(payout.recipientId).select('asaas');
    return store?.asaas?.walletId || null;
  }
  const user = await User.findById(payout.recipientId).select('asaas');
  return user?.asaas?.walletId || null;
}

/**
 * Libera UM Payout (transfere conta-mãe → subconta do recebedor) e marca como
 * 'released'. Retorna true se transferiu, false se ficou pending (sem subconta
 * ou falha). Não relança — o chamador decide como reagir.
 *
 * `throwOnError`: quando true (liberação manual do admin), relança a falha de
 * transferência para o controller devolver erro ao admin em vez de marcar pago
 * silenciosamente.
 */
async function transferPayout(payout: any, throwOnError = false): Promise<boolean> {
  const walletId = await resolveWalletId(payout);
  if (!walletId) {
    logger.warn('Liberação adiada — recebedor sem subconta Asaas; Payout segue pending', {
      orderId: String(payout.orderId),
      payoutId: String(payout._id),
      recipientType: payout.recipientType,
    });
    if (throwOnError) {
      throw new Error('Recebedor sem subconta Asaas configurada');
    }
    return false; // fica pending → admin libera manualmente
  }

  try {
    // Transferência interna conta-mãe → subconta do recebedor.
    const transfer = await asaasClient.post<AsaasTransfer>('/transfers', {
      value: Number(payout.amount.toFixed(2)),
      walletId,
    });

    // Espelho: pending → released, registrando o gateway/id da transferência.
    await payoutService.releasePayout(String(payout._id));
    payout.gatewayProvider = 'asaas';
    payout.gatewayTransferId = transfer.id;
    await payout.save();

    logger.info('Payout liberado via Asaas', {
      orderId: String(payout.orderId),
      payoutId: String(payout._id),
      recipientType: payout.recipientType,
      transferId: transfer.id,
    });
    return true;
  } catch (err) {
    logger.error('Falha ao transferir/liberar Payout no Asaas — segue pending', err as Error, {
      orderId: String(payout.orderId),
      payoutId: String(payout._id),
    });
    if (throwOnError) throw err;
    // não relança: a entrega não pode quebrar; admin resolve o Payout pendente
    return false;
  }
}

/**
 * Liberação automática do PEDIDO inteiro (loja + motoboy) — usada no fluxo
 * automático ao finalizar a entrega. Comportamento em lote é correto aqui.
 */
export async function releaseOrderViaAsaas(orderId: string): Promise<void> {
  const payouts = await Payout.find({
    orderId: new Types.ObjectId(orderId),
    status: 'pending',
    blocked: { $ne: true },
  });

  for (const payout of payouts) {
    await transferPayout(payout);
  }
}

/**
 * Liberação MANUAL de UM único Payout pelo admin. Diferente da automática:
 * libera somente o payout do id informado (liberar a loja não libera o motoboy).
 * Relança falhas para o controller devolver erro real ao admin.
 */
export async function releaseSinglePayoutViaAsaas(payoutId: string): Promise<void> {
  const payout = await Payout.findById(payoutId);
  if (!payout) throw new Error('Payout não encontrado');
  if (payout.status !== 'pending') {
    throw new Error(`Payout não está pendente (status atual: ${payout.status})`);
  }
  if (payout.blocked) throw new Error('Payout está bloqueado');

  await transferPayout(payout, true);
}

export default { releaseOrderViaAsaas, releaseSinglePayoutViaAsaas };
