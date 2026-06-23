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

/** Infere o tipo da chave PIX quando o tipo não foi salvo (fallback). */
function inferPixKeyType(key?: string): string {
  const k = (key || '').trim();
  if (k.includes('@')) return 'EMAIL';
  const digits = k.replace(/\D/g, '');
  if (digits.length === 11 && digits === k) return 'CPF';
  if (digits.length === 14) return 'CNPJ';
  if (digits.length >= 10 && digits.length <= 13) return 'PHONE';
  return 'EVP';
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

    // Resolve a subconta (apiKey cifrada), a chave PIX e o TIPO da chave do recebedor.
    let apiKeyEnc: string | undefined;
    let pixKey: string | undefined;
    let pixKeyType: string | undefined;
    if (payout.recipientType === 'store') {
      const store = await Store.findById(payout.recipientId).select('+asaas.apiKeyEncrypted');
      apiKeyEnc = store?.asaas?.apiKeyEncrypted;
      pixKey = store?.asaas?.pixKey;
      pixKeyType = store?.asaas?.pixKeyType;
    } else {
      const user = await User.findById(payout.recipientId).select('+asaas.apiKeyEncrypted');
      apiKeyEnc = user?.asaas?.apiKeyEncrypted;
      pixKey = user?.asaas?.pixKey;
      pixKeyType = user?.asaas?.pixKeyType;
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

    // O PIX debita a SUBCONTA. O espelho contábil (soma dos payouts) pode divergir
    // do saldo real por centavos (arredondamento no split), e aí o Asaas recusa a
    // operação inteira com "Saldo insuficiente". Consultamos o saldo real e sacamos
    // no máximo o que existe na subconta — o centavo de diferença não trava o saque.
    let value = Number(input.amount.toFixed(2));
    try {
      const bal = await asaasClient.getAs<{ balance: number }>(apiKey, '/finance/balance');
      const real = typeof bal?.balance === 'number' ? bal.balance : Number(bal?.balance);
      if (Number.isFinite(real)) value = Math.min(value, Number(real.toFixed(2)));
    } catch (err) {
      logger.warn('Não foi possível ler o saldo da subconta antes do saque; usando o valor pedido');
    }

    if (value <= 0) {
      return { status: 'failed', gatewayTransferId: '', errorMessage: 'Subconta sem saldo disponível para saque' };
    }

    // O Asaas EXIGE o tipo da chave (pixAddressKeyType) para resolver no DICT.
    // Sem ele, a transferência falha com "chave não encontrada" mesmo a chave válida.
    const resolvedType = (pixKeyType || inferPixKeyType(pixKey)).toUpperCase();

    try {
      const transfer = await asaasClient.postAs<AsaasTransfer>(apiKey, '/transfers', {
        value,
        operationType: 'PIX',
        pixAddressKey: pixKey,
        pixAddressKeyType: resolvedType,
      });
      return { status: mapStatus(transfer.status), gatewayTransferId: transfer.id };
    } catch (err: any) {
      logger.error('Falha no saque PIX via Asaas', err as Error, { payoutId });
      const raw = (err?.message || '').toLowerCase();
      // Mensagem mais clara para o caso mais comum (chave de destino inexistente).
      const friendly = raw.includes('não foi encontrada') || raw.includes('not found') || raw.includes('chave')
        ? 'A chave PIX de destino não foi encontrada no sistema PIX. Verifique se a chave está cadastrada no banco do recebedor. (No ambiente de testes/sandbox, use uma chave PIX fictícia do BACEN.)'
        : err?.message?.slice(0, 300);
      return { status: 'failed', gatewayTransferId: '', errorMessage: friendly };
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
