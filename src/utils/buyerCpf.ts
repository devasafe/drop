import { prisma } from '../lib/prisma';
import { AppError } from './AppError';
import { isValidCPF, isValidCNPJ } from './documentValidation';

/**
 * CPF de cobrança do comprador: regra única dos dois modos de liquidação (Task 8).
 * Ordem: CPF/CNPJ válido do perfil → documento do KYC → `cpf` do body (válido, não usado
 * por outra conta, gravado no perfil se o campo estiver vazio).
 *
 * Nunca logar o CPF completo.
 */

const onlyDigits = (s?: string | null) => String(s || '').replace(/\D/g, '');

export class CpfRequiredError extends AppError {
  constructor() {
    super('Informe seu CPF para pagar com Pix.', 400, true, 'CPF_REQUIRED');
    Object.setPrototypeOf(this, CpfRequiredError.prototype);
  }
}

type BuyerDocUser = { cpf?: string | null; verification?: unknown } | null;

/** CPF/CNPJ de cobrança do usuário (User.cpf, senão o documento do KYC). */
export function buyerDocument(user: BuyerDocUser): string | null {
  if (!user) return null;
  const candidates = [onlyDigits(user.cpf), onlyDigits((user.verification as any)?.document?.number)];
  return candidates.find((d) => d && (isValidCPF(d) || isValidCNPJ(d))) || null;
}

/** Situação do CPF para o checkout: válido, ausente ou presente porém inválido. */
export function buyerCpfStatus(user: BuyerDocUser): 'valid' | 'missing' | 'invalid' {
  if (buyerDocument(user)) return 'valid';
  const anyDoc = onlyDigits(user?.cpf) || onlyDigits((user?.verification as any)?.document?.number);
  return anyDoc ? 'invalid' : 'missing';
}

/**
 * Núcleo da pré-checagem. `lenientInvalid` (custódia): se o usuário já tem algum documento
 * (mesmo inválido) e não mandou CPF no body, devolve null em vez de CPF_REQUIRED — o caminho
 * atual segue (o Asaas recusa e o pedido é compensado, como no H3).
 */
async function resolve(userId: string, bodyCpf: unknown, lenientInvalid: boolean): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { cpf: true, verification: true } });
  const existing = buyerDocument(user);
  if (existing) return existing;
  const typed = onlyDigits(typeof bodyCpf === 'string' ? bodyCpf : '');
  if (!typed && lenientInvalid && buyerCpfStatus(user) === 'invalid') return null;
  if (typed.length !== 11 || !isValidCPF(typed)) throw new CpfRequiredError();
  // Um CPF por conta (mesma regra do perfil em userController): CPF de outra conta → 409,
  // sem gravar nada e antes de qualquer pedido/cobrança existir. Sem índice único em
  // User.cpf: duas contas gravando o mesmo CPF ao mesmo tempo ainda podem passar.
  const owner = await prisma.user.findFirst({ where: { id: { not: userId }, cpf: typed }, select: { id: true } });
  if (owner) throw new AppError('Este CPF já está cadastrado em outra conta', 409, true, 'CPF_IN_USE');
  if (!onlyDigits(user?.cpf)) {
    await prisma.user.update({ where: { id: userId }, data: { cpf: typed } });
  }
  return typed;
}

/**
 * Modo direto: garante o CPF do comprador ANTES de criar qualquer coisa do pedido.
 * Nenhum válido → CpfRequiredError (400 CPF_REQUIRED); CPF de outra conta → 409 CPF_IN_USE.
 */
export async function resolveBuyerCpf(userId: string, bodyCpf?: unknown): Promise<string> {
  return (await resolve(userId, bodyCpf, false)) as string;
}

/**
 * Custódia + Pix: mesma regra, exceto que um documento presente porém inválido (sem CPF no
 * body) devolve null e segue o caminho atual. Sem nenhum CPF → 400 CPF_REQUIRED.
 */
export async function precheckBuyerCpf(userId: string, bodyCpf?: unknown): Promise<string | null> {
  return resolve(userId, bodyCpf, true);
}
