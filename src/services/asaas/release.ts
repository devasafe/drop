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

export async function releaseOrderViaAsaas(orderId: string): Promise<void> {
  const payouts = await Payout.find({
    orderId: new Types.ObjectId(orderId),
    status: 'pending',
    blocked: { $ne: true },
  });

  for (const payout of payouts) {
    const walletId = await resolveWalletId(payout);
    if (!walletId) {
      logger.warn('Liberação adiada — recebedor sem subconta Asaas; Payout segue pending', {
        orderId,
        payoutId: String(payout._id),
        recipientType: payout.recipientType,
      });
      continue; // fica pending → admin libera manualmente
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
        orderId,
        payoutId: String(payout._id),
        recipientType: payout.recipientType,
        transferId: transfer.id,
      });
    } catch (err) {
      logger.error('Falha ao transferir/liberar Payout no Asaas — segue pending', err as Error, {
        orderId,
        payoutId: String(payout._id),
      });
      // não relança: a entrega não pode quebrar; admin resolve o Payout pendente
    }
  }
}

export default { releaseOrderViaAsaas };
