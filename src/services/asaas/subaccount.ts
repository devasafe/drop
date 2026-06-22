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

/**
 * Recupera uma subconta JÁ EXISTENTE no Asaas pelo CPF/CNPJ. A conta-mãe consegue
 * listar suas subcontas (com id, walletId e apiKey). Usado para consertar registros
 * que ficaram com a subconta criada no Asaas mas SEM a apiKey salva no nosso banco
 * (criação parcial) — sem isso o saque "da subconta" é impossível.
 */
async function findExistingAsaasAccount(
  cpfCnpj: string,
): Promise<{ id: string; walletId?: string; apiKey?: string } | null> {
  const digits = onlyDigits(cpfCnpj);
  if (!digits) return null;
  try {
    const resp = await asaasClient.get<{ data?: any[] }>(`/accounts?cpfCnpj=${digits}`);
    const list = Array.isArray(resp?.data) ? resp.data : [];
    const match = list.find((a) => onlyDigits(a?.cpfCnpj) === digits) || list[0];
    if (!match?.id) return null;
    return { id: match.id, walletId: match.walletId, apiKey: match.apiKey };
  } catch (err) {
    logger.warn('Falha ao listar subcontas no Asaas para recuperação', { cpfCnpj: digits });
    return null;
  }
}

/** Indica se o erro do Asaas é "subconta/CPF já cadastrado". */
function isAlreadyExistsError(err: any): boolean {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('já') || msg.includes('already') || msg.includes('existe') || msg.includes('cadastrad');
}

/** Cria/garante a subconta do MOTOBOY (no User, pelo CPF). */
export async function ensureMotoboySubaccount(userId: string): Promise<void> {
  const user = await User.findById(userId).select('+asaas.apiKeyEncrypted');
  if (!user) return;
  if (user.asaas?.accountId && user.asaas?.apiKeyEncrypted) return; // já criada e com apiKey

  const cpf = onlyDigits(user.cpf);

  // Conserto: subconta já registrada (accountId) mas SEM apiKey no nosso banco
  // (criação parcial). Recupera a apiKey listando a subconta no Asaas.
  if (user.asaas?.accountId && !user.asaas?.apiKeyEncrypted) {
    const found = await findExistingAsaasAccount(cpf);
    if (!user.asaas) (user as any).asaas = { status: 'none' };
    if (found?.apiKey) {
      user.asaas!.walletId = found.walletId || user.asaas!.walletId;
      user.asaas!.apiKeyEncrypted = encryptSensitiveData(found.apiKey);
      user.asaas!.status = 'active';
      user.asaas!.lastError = undefined;
      logger.info('apiKey da subconta do motoboy recuperada do Asaas', { userId });
    } else {
      user.asaas!.status = 'error';
      user.asaas!.lastError = 'Subconta existe no Asaas, mas a apiKey não pôde ser recuperada automaticamente.';
    }
    user.markModified('asaas');
    await user.save();
    return;
  }
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
    // A subconta já existia no Asaas (criação parcial anterior) → recupera credenciais.
    if (isAlreadyExistsError(err)) {
      const found = await findExistingAsaasAccount(cpf);
      if (found?.id) {
        user.asaas!.accountId = found.id;
        user.asaas!.walletId = found.walletId || user.asaas!.walletId;
        if (found.apiKey) user.asaas!.apiKeyEncrypted = encryptSensitiveData(found.apiKey);
        user.asaas!.status = found.apiKey ? 'active' : 'error';
        user.asaas!.lastError = found.apiKey ? undefined : 'Subconta recuperada sem apiKey — recupere manualmente.';
        user.markModified('asaas');
        await user.save();
        logger.info('Subconta do motoboy recuperada após "já existe"', { userId, accountId: found.id });
        return;
      }
    }
    user.asaas!.status = 'error';
    user.asaas!.lastError = err?.message?.slice(0, 300);
    user.markModified('asaas');
    await user.save();
    logger.error('Falha ao criar subconta do motoboy', err as Error, { userId });
  }
}

/** Cria/garante a subconta da LOJA (no Store, pela CNPJ ou CPF do dono). */
export async function ensureStoreSubaccount(storeId: string): Promise<void> {
  const store = await Store.findById(storeId).select('+asaas.apiKeyEncrypted');
  if (!store) return;
  if (store.asaas?.accountId && store.asaas?.apiKeyEncrypted) return;

  const owner = await User.findById(store.ownerId);
  if (!owner) return;

  // CNPJ da loja se houver; senão CPF do dono (MEI / autônomo).
  const cnpj = onlyDigits(store.cnpj);
  const cpf = onlyDigits(owner.cpf);
  const doc = cnpj.length === 14 ? cnpj : cpf;

  // Conserto: subconta registrada (accountId) mas SEM apiKey → recupera do Asaas.
  if (store.asaas?.accountId && !store.asaas?.apiKeyEncrypted) {
    const found = await findExistingAsaasAccount(doc);
    if (!store.asaas) (store as any).asaas = { status: 'none' };
    if (found?.apiKey) {
      store.asaas!.walletId = found.walletId || store.asaas!.walletId;
      store.asaas!.apiKeyEncrypted = encryptSensitiveData(found.apiKey);
      store.asaas!.status = 'active';
      store.asaas!.lastError = undefined;
      logger.info('apiKey da subconta da loja recuperada do Asaas', { storeId });
    } else {
      store.asaas!.status = 'error';
      store.asaas!.lastError = 'Subconta existe no Asaas, mas a apiKey não pôde ser recuperada automaticamente.';
    }
    store.markModified('asaas');
    await store.save();
    return;
  }
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
    if (isAlreadyExistsError(err)) {
      const found = await findExistingAsaasAccount(doc);
      if (found?.id) {
        store.asaas!.accountId = found.id;
        store.asaas!.walletId = found.walletId || store.asaas!.walletId;
        if (found.apiKey) store.asaas!.apiKeyEncrypted = encryptSensitiveData(found.apiKey);
        store.asaas!.status = found.apiKey ? 'active' : 'error';
        store.asaas!.lastError = found.apiKey ? undefined : 'Subconta recuperada sem apiKey — recupere manualmente.';
        store.markModified('asaas');
        await store.save();
        logger.info('Subconta da loja recuperada após "já existe"', { storeId, accountId: found.id });
        return;
      }
    }
    store.asaas!.status = 'error';
    store.asaas!.lastError = err?.message?.slice(0, 300);
    store.markModified('asaas');
    await store.save();
    logger.error('Falha ao criar subconta da loja', err as Error, { storeId });
  }
}

export default { ensureMotoboySubaccount, ensureStoreSubaccount };
