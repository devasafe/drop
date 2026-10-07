/**
 * Cria usuário real no Postgres + JWT assinado (mesmo padrão de hardening.test.ts).
 * Cada suíte passa seu próprio domínio de e-mail para o cleanup não apagar dados de outra.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export const TEST_JWT_SECRET =
  process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';

const VERIFIED_CLIENT = {
  email: { status: 'verified', verifiedAt: new Date() },
  document: { type: 'cpf', status: 'approved' },
};

const VERIFIED_COURIER = {
  ...VERIFIED_CLIENT,
  facial: { status: 'approved' },
  courier: { status: 'approved', cnhNumber: '00000000000', plate: 'ABC1D23' },
};

export interface TestUser {
  token: string;
  userId: string;
  role: string;
}

export async function createTestUser(
  role: string,
  domain: string,
  opts: { verified?: boolean } = {}
): Promise<TestUser> {
  const verified = opts.verified !== false;
  const roles = role !== 'cliente' ? [role, 'cliente'] : ['cliente'];
  const user = await prisma.user.create({
    data: {
      name: `User ${role}`,
      email: `u-${Date.now()}-${Math.random().toString(36).slice(2)}${domain}`,
      passwordHash: await bcrypt.hash('Senha123!', 4),
      role: role as Role,
      roles: roles as Role[],
      activeRole: role as Role,
      verification: verified ? (role === 'motoboy' ? VERIFIED_COURIER : VERIFIED_CLIENT) : {},
    },
  });
  const token = jwt.sign({ id: user.id, role, activeRole: role, roles }, TEST_JWT_SECRET, {
    expiresIn: '1h',
  });
  return { token, userId: user.id, role };
}

export const bearer = (u: TestUser) => `Bearer ${u.token}`;
