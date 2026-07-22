import { Address, Prisma, User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData, decryptSensitiveData } from '../utils/encryption';

/**
 * Acesso a `User` via Prisma — Fase 4, Fatia 1.
 *
 * Existe para que a cifra de `bankInfo` tenha um único lugar. No Mongoose isso
 * era feito por hooks de schema, invisíveis a quem chamava; com 35 call sites de
 * `User` no projeto, espalhar `prisma.user.*` direto seria garantir que uma hora
 * alguém gravasse dado bancário em texto puro.
 */

export type UserWithBankInfo = User & { bankInfo: Prisma.JsonValue | null };

/**
 * `addresses` era um subdocumento do User no Mongo; virou tabela com FK. Quem
 * respondia `user.addresses` direto (login, switchRole) precisa carregá-lo.
 */
export type UserWithAddresses = UserWithBankInfo & { addresses: Address[] };

/**
 * Cifra `bankInfo` e zera o campo em texto puro.
 * Equivale ao `pre('save')` do Mongoose (src/models/User.ts:271).
 */
function encryptBankInfo<T extends Prisma.UserCreateInput | Prisma.UserUpdateInput>(data: T): T {
  const bankInfo = (data as any).bankInfo;
  if (bankInfo && bankInfo.isConfigured) {
    (data as any).bankInfoEncrypted = encryptSensitiveData(JSON.stringify(bankInfo));
    (data as any).bankInfo = Prisma.DbNull;
  }
  return data;
}

/**
 * Decifra `bankInfo` na leitura.
 * Equivale ao `post(/^findOne/)` do Mongoose (src/models/User.ts:291) — inclusive
 * no detalhe de devolver null quando a decifragem falha, em vez de lançar.
 */
function decryptBankInfo(user: User | null): UserWithBankInfo | null {
  if (!user) return null;
  const result = user as UserWithBankInfo;
  if (user.bankInfoEncrypted && !user.bankInfo) {
    try {
      result.bankInfo = JSON.parse(decryptSensitiveData(user.bankInfoEncrypted));
    } catch {
      result.bankInfo = null;
    }
  }
  return result;
}

class UserRepository {
  async findById(id: string): Promise<UserWithBankInfo | null> {
    return decryptBankInfo(await prisma.user.findUnique({ where: { id } }));
  }

  async findByEmail(email: string): Promise<UserWithBankInfo | null> {
    return decryptBankInfo(await prisma.user.findUnique({ where: { email } }));
  }

  async findByIdWithAddresses(id: string): Promise<UserWithAddresses | null> {
    const user = await prisma.user.findUnique({ where: { id }, include: { addresses: true } });
    return decryptBankInfo(user) as UserWithAddresses | null;
  }

  async findByEmailWithAddresses(email: string): Promise<UserWithAddresses | null> {
    const user = await prisma.user.findUnique({ where: { email }, include: { addresses: true } });
    return decryptBankInfo(user) as UserWithAddresses | null;
  }

  async create(data: Prisma.UserCreateInput): Promise<UserWithBankInfo> {
    const user = await prisma.user.create({ data: encryptBankInfo(data) });
    return decryptBankInfo(user)!;
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<UserWithBankInfo> {
    const user = await prisma.user.update({ where: { id }, data: encryptBankInfo(data) });
    return decryptBankInfo(user)!;
  }
}

export const userRepository = new UserRepository();
export default userRepository;
