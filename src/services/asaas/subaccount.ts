import asaasClient from './client';
import { encryptSensitiveData } from '../../utils/encryption';
import logger from '../../config/logger';
import User from '../../models/User';
import Store from '../../models/Store';

/**
 * Criação de subcontas Asaas (recebedores do split).
 *
 * Mapeamento (alinhado com Payout.recipientType):
 *   - 'store'   → subconta no documento Store (CNPJ da loja, ou CPF do dono se MEI/sem CNPJ)
 *   - 'motoboy' → subconta no documento User (CPF do motoboy)
 *
 * Idempotente: se já existe accountId, não recria.
 * Defensivo: nunca lança pro chamador (o aprovador de KYC não pode quebrar por
 * causa do gateway) — em caso de erro grava status 'error' + lastError.
 */

interface AsaasAccountResponse {
  id: string;
  walletId: string;
  apiKey: string;
}

interface SubaccountInput {
  name: string;
  email: string;
  cpfCnpj: string;
  mobilePhone?: string;
  birthDate?: string; // YYYY-MM-DD (pessoa física)
  companyType?: 'MEI' | 'LIMITED' | 'INDIVIDUAL' | 'ASSOCIATION'; // pessoa jurídica
  incomeValue: number; // faturamento/renda mensal estimada
  address?: string;
  addressNumber?: string;
  province?: string; // bairro
  postalCode?: string;
}

const onlyDigits = (s?: string) => (s || '').replace(/\D/g, '');
const isCnpj = (doc: string) => onlyDigits(doc).length === 14;

// O Asaas exige e-mail ÚNICO por subconta. Se a mesma pessoa é motoboy (subconta
// no User, com o e-mail dela) E dono de loja (subconta no Store), os e-mails
// colidiriam. Derivamos um e-mail "+loja" pra subconta da loja (plus-addressing
// cai na mesma caixa no Gmail e na maioria dos provedores).
function storeEmail(ownerEmail: string): string {
  const [local, domain] = (ownerEmail || '').split('@');
  if (!local || !domain) return ownerEmail;
  return `${local}+loja@${domain}`;
}

/** Chamada de baixo nível: cria a subconta no Asaas. */
async function createSubaccount(input: SubaccountInput): Promise<AsaasAccountResponse> {
  const cpfCnpj = onlyDigits(input.cpfCnpj);
  const payload: Record<string, unknown> = {
    name: input.name,
    email: input.email,
    cpfCnpj,
    mobilePhone: onlyDigits(input.mobilePhone),
    incomeValue: input.incomeValue,
    address: input.address,
    addressNumber: input.addressNumber,
    province: input.province,
    postalCode: onlyDigits(input.postalCode),
  };
  if (isCnpj(cpfCnpj)) {
    payload.companyType = input.companyType || 'MEI';
  } else {
    payload.birthDate = input.birthDate;
  }
  return asaasClient.post<AsaasAccountResponse>('/accounts', payload);
}

function firstAddress(addresses?: any[]) {
  if (!addresses?.length) return undefined;
  return addresses.find((a) => a.isDefault) || addresses[0];
}

/** Cria/garante a subconta do MOTOBOY (no User, pelo CPF). */
export async function ensureMotoboySubaccount(userId: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user) return;
  if (user.asaas?.accountId) return; // já criada

  const cpf = onlyDigits(user.cpf);
  const addr = firstAddress(user.addresses as any);
  const missing: string[] = [];
  if (!user.name) missing.push('nome');
  if (!user.email) missing.push('email');
  if (cpf.length !== 11) missing.push('CPF válido');
  if (!user.dataNascimento) missing.push('data de nascimento');
  if (!addr) missing.push('endereço');

  if (!user.asaas) (user as any).asaas = { status: 'none' };

  if (missing.length) {
    user.asaas!.status = 'error';
    user.asaas!.lastError = `Faltam dados p/ subconta: ${missing.join(', ')}`;
    user.markModified('asaas');
    await user.save();
    logger.warn('Subconta motoboy não criada — dados faltando', { userId, missing });
    return;
  }

  try {
    user.asaas!.status = 'pending';
    user.markModified('asaas');
    await user.save();

    const acc = await createSubaccount({
      name: user.name,
      email: user.email,
      cpfCnpj: cpf,
      mobilePhone: user.telefone || user.verification?.phone?.e164,
      birthDate: user.dataNascimento,
      incomeValue: 3000,
      address: addr.street,
      addressNumber: addr.number,
      province: addr.neighborhood,
      postalCode: addr.cep,
    });

    user.asaas!.accountId = acc.id;
    user.asaas!.walletId = acc.walletId;
    user.asaas!.apiKeyEncrypted = encryptSensitiveData(acc.apiKey);
    user.asaas!.status = 'active';
    user.asaas!.lastError = undefined;
    user.markModified('asaas');
    await user.save();
    logger.info('Subconta Asaas do motoboy criada', { userId, accountId: acc.id });
  } catch (err: any) {
    user.asaas!.status = 'error';
    user.asaas!.lastError = err?.message?.slice(0, 300);
    user.markModified('asaas');
    await user.save();
    logger.error('Falha ao criar subconta do motoboy', err as Error, { userId });
  }
}

/** Cria/garante a subconta da LOJA (no Store, pela CNPJ ou CPF do dono). */
export async function ensureStoreSubaccount(storeId: string): Promise<void> {
  const store = await Store.findById(storeId);
  if (!store) return;
  if (store.asaas?.accountId) return;

  const owner = await User.findById(store.ownerId);
  if (!owner) return;

  // CNPJ da loja se houver; senão CPF do dono (MEI / autônomo).
  const cnpj = onlyDigits(store.cnpj);
  const cpf = onlyDigits(owner.cpf);
  const doc = cnpj.length === 14 ? cnpj : cpf;
  const addr =
    store.street
      ? { street: store.street, number: store.number, neighborhood: store.neighborhood, cep: store.zip }
      : firstAddress(owner.addresses as any);

  const missing: string[] = [];
  if (!store.name) missing.push('nome da loja');
  if (!owner.email) missing.push('email do dono');
  if (doc.length !== 14 && doc.length !== 11) missing.push('CNPJ ou CPF válido');
  if (!addr?.street) missing.push('endereço');
  if (doc.length === 11 && !owner.dataNascimento) missing.push('data de nascimento do dono');

  if (!store.asaas) (store as any).asaas = { status: 'none' };

  if (missing.length) {
    store.asaas!.status = 'error';
    store.asaas!.lastError = `Faltam dados p/ subconta: ${missing.join(', ')}`;
    store.markModified('asaas');
    await store.save();
    logger.warn('Subconta loja não criada — dados faltando', { storeId, missing });
    return;
  }

  try {
    store.asaas!.status = 'pending';
    store.markModified('asaas');
    await store.save();

    const acc = await createSubaccount({
      name: store.name,
      email: storeEmail(owner.email),
      cpfCnpj: doc,
      mobilePhone: owner.telefone || owner.verification?.phone?.e164,
      birthDate: doc.length === 11 ? owner.dataNascimento : undefined,
      companyType: 'MEI',
      incomeValue: 5000,
      address: addr!.street,
      addressNumber: (addr as any).number,
      province: (addr as any).neighborhood,
      postalCode: (addr as any).cep || (addr as any).zip,
    });

    store.asaas!.accountId = acc.id;
    store.asaas!.walletId = acc.walletId;
    store.asaas!.apiKeyEncrypted = encryptSensitiveData(acc.apiKey);
    store.asaas!.status = 'active';
    store.asaas!.lastError = undefined;
    store.markModified('asaas');
    await store.save();
    logger.info('Subconta Asaas da loja criada', { storeId, accountId: acc.id });
  } catch (err: any) {
    store.asaas!.status = 'error';
    store.asaas!.lastError = err?.message?.slice(0, 300);
    store.markModified('asaas');
    await store.save();
    logger.error('Falha ao criar subconta da loja', err as Error, { storeId });
  }
}

export default { ensureMotoboySubaccount, ensureStoreSubaccount };
