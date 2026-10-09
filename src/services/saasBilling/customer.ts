import asaasClient from '../asaas/client';
import logger from '../../config/logger';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';
import { isValidCPF, isValidCNPJ } from '../../utils/documentValidation';

const onlyDigits = (s?: string | null) => (s || '').replace(/\D/g, '');

/**
 * Customer DEDICADO da mensalidade, na conta-mãe. Não reaproveita `User.asaas.customerId`
 * (é o do comprador). Notificações do Asaas ficam LIGADAS: é o Asaas quem manda a fatura
 * por e-mail para a loja. Documento: CNPJ válido da loja ou, na falta, CPF válido do dono.
 * Sem documento válido → AppError SAAS_BILLING_NO_DOCUMENT (o job loga e tenta no próximo ciclo).
 */
export async function ensureBillingCustomer(billing: { id: string; storeId: string; asaasCustomerId?: string | null }): Promise<string> {
  if (billing.asaasCustomerId) return billing.asaasCustomerId;

  const store = await prisma.store.findUnique({
    where: { id: billing.storeId },
    select: { id: true, name: true, cnpj: true, owner: { select: { email: true, cpf: true } } },
  });
  if (!store) throw new AppError('Loja não encontrada', 404, true, 'STORE_NOT_FOUND');

  const cnpj = onlyDigits(store.cnpj);
  const cpf = onlyDigits(store.owner?.cpf);
  const cpfCnpj = cnpj && isValidCNPJ(cnpj) ? cnpj : cpf && isValidCPF(cpf) ? cpf : null;
  if (!cpfCnpj) {
    throw new AppError('Loja sem CNPJ válido e dono sem CPF válido para a mensalidade', 422, true, 'SAAS_BILLING_NO_DOCUMENT');
  }

  const customer = await asaasClient.post<{ id: string }>('/customers', {
    name: store.name,
    email: store.owner?.email,
    cpfCnpj,
    externalReference: `saas-store:${store.id}`,
  });

  // Condicional: se outro processo gravou antes, vale o dele (o customer criado aqui sobra sem uso).
  const { count } = await prisma.storeSaasBilling.updateMany({
    where: { id: billing.id, asaasCustomerId: null },
    data: { asaasCustomerId: customer.id },
  });
  if (count === 1) return customer.id;

  const fresh = await prisma.storeSaasBilling.findUnique({ where: { id: billing.id }, select: { asaasCustomerId: true } });
  logger.warn('[saas-billing] customer criado em corrida; usando o já gravado', { billingId: billing.id, storeId: billing.storeId });
  if (!fresh?.asaasCustomerId) throw new AppError('Cobrança SaaS não encontrada', 404, true, 'SAAS_BILLING_NOT_FOUND');
  return fresh.asaasCustomerId;
}
