import asaasClient from './client';
import logger from '../../config/logger';
import User from '../../models/User';

/**
 * Cobrança de ENTRADA (cliente paga). Custódia: o valor cai INTEIRO na conta-mãe
 * Asaas (sem split na cobrança). A distribuição p/ loja e motoboy acontece na
 * entrega (Fase 3), via transferências — dando controle exato do gatilho "libera no PIN".
 *
 * Cliente Asaas (POST /customers) é criado no buyer sob demanda e cacheado em
 * User.asaas.customerId.
 */

const onlyDigits = (s?: string) => (s || '').replace(/\D/g, '');

interface AsaasCustomer {
  id: string;
}

interface AsaasPayment {
  id: string;
  status: string;
}

export interface PixCharge {
  paymentId: string;
  status: string;
  qrCodeImage?: string; // base64 (encodedImage)
  qrCodePayload?: string; // copia-e-cola
  expiresAt?: string;
}

/** Garante um customer Asaas pro comprador (cria e cacheia se não existir). */
export async function ensureAsaasCustomer(userId: string): Promise<string | null> {
  const user = await User.findById(userId);
  if (!user) return null;
  if (user.asaas?.customerId) return user.asaas.customerId;

  const cpf = onlyDigits(user.cpf);
  const customer = await asaasClient.post<AsaasCustomer>('/customers', {
    name: user.name,
    email: user.email,
    cpfCnpj: cpf || undefined,
    mobilePhone: onlyDigits(user.telefone || user.verification?.phone?.e164),
    externalReference: String(user._id),
  });

  if (!user.asaas) (user as any).asaas = { status: 'none' };
  user.asaas!.customerId = customer.id;
  user.markModified('asaas');
  await user.save();
  return customer.id;
}

/** Cria uma cobrança PIX na conta-mãe e devolve o QR/copia-e-cola. */
export async function createPixCharge(params: {
  customerId: string;
  value: number;
  orderId: string;
  description?: string;
}): Promise<PixCharge> {
  const today = new Date();
  const dueDate = today.toISOString().slice(0, 10); // YYYY-MM-DD (PIX pode pagar no mesmo dia)

  const payment = await asaasClient.post<AsaasPayment>('/payments', {
    customer: params.customerId,
    billingType: 'PIX',
    value: Number(params.value.toFixed(2)),
    dueDate,
    description: params.description || `Pedido ${params.orderId}`,
    externalReference: params.orderId,
  });

  const charge: PixCharge = { paymentId: payment.id, status: payment.status };

  // Busca o QR Code do PIX (endpoint separado no Asaas).
  try {
    const qr = await asaasClient.get<{ encodedImage: string; payload: string; expirationDate: string }>(
      `/payments/${payment.id}/pixQrCode`
    );
    charge.qrCodeImage = qr.encodedImage;
    charge.qrCodePayload = qr.payload;
    charge.expiresAt = qr.expirationDate;
  } catch (err) {
    logger.warn('Cobrança criada mas falhou ao obter QR PIX', { paymentId: payment.id });
  }

  return charge;
}

export default { ensureAsaasCustomer, createPixCharge };
