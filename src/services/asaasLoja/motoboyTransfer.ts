// Registro da transferência Pix da loja ao motoboy (modo direto). Aqui só REGISTRA a linha
// MotoboyTransfer dentro da transação da entrega; o envio é feito por outro serviço.
import { Prisma, MotoboyTransfer } from '@prisma/client';
import { encryptSensitiveData } from '../../utils/encryption';
import { getSaasConfig } from '../../utils/settlement';
import { emitToRoom } from '../../utils/socketEmitter';
import logger from '../../config/logger';

export type TransferReason = 'delivery' | 'cancellation_compensation';

const DEFAULT_MAX_AMOUNT = 150;

/**
 * Máscara de chave Pix para logs/notificações: nunca devolve a chave inteira.
 * `type` (CPF/CNPJ/EMAIL/PHONE/EVP) desambigua 11 dígitos (CPF x celular); sem ele,
 * 11 dígitos puros são tratados como CPF e telefone exige +55 ou parênteses.
 */
export function maskPixKey(key: string, type?: string): string {
  const k = String(key ?? '').trim();
  if (!k) return '';
  const t = String(type ?? '').toUpperCase();
  const digits = k.replace(/\D/g, '');
  if (t === 'EMAIL' || k.includes('@')) {
    const [user, domain = ''] = k.split('@');
    const dot = domain.indexOf('.');
    const host = dot >= 0 ? domain.slice(0, dot) : domain;
    const tld = dot >= 0 ? domain.slice(dot) : '';
    return `${user.slice(0, 1)}***@${host.slice(0, 1)}***${tld}`;
  }
  const looksPhone = t === 'PHONE' || k.startsWith('+') || k.includes('(');
  if (looksPhone && digits.length >= 10) return `(**) *****-${digits.slice(-4)}`;
  if ((t === 'CPF' || !t) && digits.length === 11 && /^[\d.\-\s]+$/.test(k)) return `***.***.***-${digits.slice(-2)}`;
  if (k.length <= 8) return '*'.repeat(k.length);
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

/**
 * Cria a MotoboyTransfer da entrega (1 por delivery, unique em deliveryId).
 * Deve ser chamada DENTRO da transação da trava picked→delivered.
 */
export async function createTransferForDelivery(
  tx: Prisma.TransactionClient,
  delivery: { id: string; motoboyId: string | null; fee: any },
  order: { id: string; storeId: string },
  reason: TransferReason = 'delivery',
  amountOverride?: number,
): Promise<MotoboyTransfer> {
  const cfg = await getSaasConfig();
  const pc: any = await tx.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
  const maxAmount = Number(pc?.directTransferMaxAmount ?? DEFAULT_MAX_AMOUNT);
  const base = amountOverride != null ? Number(amountOverride) : (Number(delivery.fee) * cfg.motoboyShareDirect) / 100;
  const amount = Math.round(base * 100) / 100;

  const user = delivery.motoboyId ? await tx.user.findUnique({ where: { id: String(delivery.motoboyId) }, select: { asaas: true } }) : null;
  const asaas: any = user?.asaas ?? {};
  const pixKey = typeof asaas.pixKey === 'string' ? asaas.pixKey.trim() : '';

  let status = 'pending';
  let lastError: string | null = null;
  if (Math.round(amount * 100) > Math.round(maxAmount * 100)) {
    status = 'failed_final';
    lastError = 'AMOUNT_OVER_LIMIT';
  } else if (!pixKey) {
    status = 'failed';
    lastError = 'MOTOBOY_PIX_KEY_MISSING';
  }

  return tx.motoboyTransfer.create({
    data: {
      deliveryId: delivery.id,
      orderId: order.id,
      storeId: order.storeId,
      motoboyId: String(delivery.motoboyId),
      reason,
      amount,
      pixKeyEncrypted: pixKey ? encryptSensitiveData(pixKey) : '',
      pixKeyType: pixKey ? String(asaas.pixKeyType ?? '') : '',
      status,
      lastError,
    },
  });
}

/** Avisos pós-commit (socket só para salas; sem chave Pix no payload). */
export function notifyTransferCreated(t: Pick<MotoboyTransfer, 'id' | 'status' | 'lastError' | 'motoboyId' | 'storeId' | 'orderId' | 'amount'>): void {
  if (t.status === 'pending') return;
  try {
    const payload = { transferId: t.id, orderId: t.orderId, storeId: t.storeId, amount: Number(t.amount), error: t.lastError };
    if (t.lastError === 'MOTOBOY_PIX_KEY_MISSING') {
      emitToRoom(`user:${t.motoboyId}`, 'motoboy:transfer_pix_key_missing', payload);
    }
    emitToRoom('admin', 'motoboy:transfer_alert', payload);
    logger.warn('[motoboyTransfer] transferência nasceu com pendência', { transferId: t.id, status: t.status, error: t.lastError });
  } catch (err) {
    logger.error('[motoboyTransfer] falha ao notificar', err as Error, { transferId: t.id });
  }
}
