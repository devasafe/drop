import asaasClient from './client';
import logger from '../../config/logger';
import User from '../../models/User';
import { isValidCPF, isValidCNPJ } from '../../utils/documentValidation';

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
  // carrega a apiKeyEncrypted p/ não apagá-la no markModified('asaas')+save abaixo
  // (o mesmo usuário pode ser comprador E recebedor com subconta)
  const user = await User.findById(userId).select('+asaas.apiKeyEncrypted');
  if (!user) return null;
  if (user.asaas?.customerId) return user.asaas.customerId;

  const cpf = onlyDigits(user.cpf);
  // O Asaas exige CPF/CNPJ válido p/ cobrança PIX. Validar localmente dá uma
  // mensagem clara e acionável em vez do erro genérico do gateway.
  if (!cpf || (!isValidCPF(cpf) && !isValidCNPJ(cpf))) {
    const err: any = new Error('Seu CPF é inválido ou não foi cadastrado. Corrija em "Editar meus dados" para pagar.');
    err.errors = [{ code: 'invalid_cpf', description: err.message }];
    throw err;
  }

  const customer = await asaasClient.post<AsaasCustomer>('/customers', {
    name: user.name,
    email: user.email,
    cpfCnpj: cpf,
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

/** Busca o QR Code PIX de uma cobrança existente (p/ retomar pagamento). */
export async function getPixQrCode(asaasPaymentId: string): Promise<{ qrCodeImage?: string; qrCodePayload?: string; expiresAt?: string }> {
  const qr = await asaasClient.get<{ encodedImage: string; payload: string; expirationDate: string }>(
    `/payments/${asaasPaymentId}/pixQrCode`
  );
  return { qrCodeImage: qr.encodedImage, qrCodePayload: qr.payload, expiresAt: qr.expirationDate };
}

/** Status atual de uma cobrança no Asaas (reconciliação independente do webhook). */
export async function getPaymentStatus(asaasPaymentId: string): Promise<string | null> {
  try {
    const p = await asaasClient.get<{ status: string }>(`/payments/${asaasPaymentId}`);
    return p?.status || null;
  } catch (err) {
    logger.warn('Não foi possível consultar o status da cobrança no Asaas', { asaasPaymentId });
    return null;
  }
}

/**
 * Cancela/exclui uma cobrança ainda não paga no Asaas.
 * Retorna true se foi excluída (não estava paga); false se não pôde (ex: já recebida).
 */
export async function cancelCharge(asaasPaymentId: string): Promise<boolean> {
  try {
    await asaasClient.delete(`/payments/${asaasPaymentId}`);
    return true;
  } catch (err) {
    logger.warn('Não foi possível excluir a cobrança no Asaas (provavelmente já paga)', { asaasPaymentId });
    return false;
  }
}

export default { ensureAsaasCustomer, createPixCharge, cancelCharge };
