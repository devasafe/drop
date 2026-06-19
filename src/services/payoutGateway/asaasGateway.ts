import { IPayoutGateway, TransferInput, TransferResult } from './types';
import asaasClient from '../asaas/client';
import { decryptSensitiveData } from '../../utils/encryption';
import logger from '../../config/logger';
import Payout from '../../models/Payout';
import Store from '../../models/Store';
import User from '../../models/User';

/**
 * Gateway de SAÍDA (saque) via Asaas.
 *
 * O dinheiro do recebedor já está na subconta dele (transferido na entrega — Fase 3).
 * O saque é uma transferência PIX da SUBCONTA → chave PIX do próprio recebedor.
 * Por isso a chamada é autenticada COM a apiKey da subconta (postAs).
 *
 * O recebedor é resolvido a partir do 1º payout do saque (todos são do mesmo recebedor).
 */

interface AsaasTransfer {
  id: string;
  status: string;
}

function mapStatus(asaasStatus?: string): 'pending' | 'paid' | 'failed' {
  switch (asaasStatus) {
    case 'DONE':
      return 'paid';
    case 'FAILED':
    case 'CANCELLED':
      return 'failed';
    default:
      return 'pending'; // PENDING, BANK_PROCESSING, etc.
  }
}

export class AsaasGateway implements IPayoutGateway {
  readonly provider = 'asaas';

  async transfer(input: TransferInput): Promise<TransferResult> {
    const payoutId = input.payoutIds?.[0];
    if (!payoutId) {
      return { status: 'failed', gatewayTransferId: '', errorMessage: 'Saque sem payouts vinculados' };
    }

    const payout = await Payout.findById(payoutId);
    if (!payout) {
      return { status: 'failed', gatewayTransferId: '', errorMessage: 'Payout não encontrado' };
    }

    // Resolve a subconta (apiKey cifrada) e a chave PIX do recebedor.
    let apiKeyEnc: string | undefined;
    let pixKey: string | undefined;
    if (payout.recipientType === 'store') {
      const store = await Store.findById(payout.recipientId).select('+asaas.apiKeyEncrypted');
      apiKeyEnc = store?.asaas?.apiKeyEncrypted;
      pixKey = store?.asaas?.pixKey;
    } else {
      const user = await User.findById(payout.recipientId).select('+asaas.apiKeyEncrypted');
      apiKeyEnc = user?.asaas?.apiKeyEncrypted;
      pixKey = user?.asaas?.pixKey;
    }

    if (!apiKeyEnc) {
      return { status: 'failed', gatewayTransferId: '', errorMessage: 'Subconta do recebedor não configurada' };
    }
    if (!pixKey) {
      return { status: 'failed', gatewayTransferId: '', errorMessage: 'Recebedor sem chave PIX cadastrada' };
    }

    let apiKey: string;
    try {
      apiKey = decryptSensitiveData(apiKeyEnc);
    } catch (err) {
      logger.error('Falha ao decifrar apiKey da subconta', err as Error);
      return { status: 'failed', gatewayTransferId: '', errorMessage: 'Erro ao acessar a subconta' };
    }

    try {
      const transfer = await asaasClient.postAs<AsaasTransfer>(apiKey, '/transfers', {
        value: Number(input.amount.toFixed(2)),
        operationType: 'PIX',
        pixAddressKey: pixKey,
      });
      return { status: mapStatus(transfer.status), gatewayTransferId: transfer.id };
    } catch (err: any) {
      logger.error('Falha no saque PIX via Asaas', err as Error, { payoutId });
      return { status: 'failed', gatewayTransferId: '', errorMessage: err?.message?.slice(0, 300) };
    }
  }

  async getStatus(gatewayTransferId: string): Promise<{ status: 'pending' | 'paid' | 'failed' }> {
    try {
      const t = await asaasClient.get<AsaasTransfer>(`/transfers/${gatewayTransferId}`);
      return { status: mapStatus(t.status) };
    } catch {
      return { status: 'pending' };
    }
  }
}

export default AsaasGateway;
