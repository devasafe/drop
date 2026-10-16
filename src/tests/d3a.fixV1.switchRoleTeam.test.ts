import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';

// D3a · correção V1: a equipe (gerentes de lojistas/motoboys) volta ao painel pela troca de área.
const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';
const DOMAIN = '@d3a-fixv1.test';

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function createUser(roles: string[], activeRole: string) {
  const email = `u-${Date.now()}-${Math.random().toString(36).slice(2)}${DOMAIN}`;
  const user = await prisma.user.create({
    data: {
      name: 'Equipe',
      email,
      passwordHash: await bcrypt.hash('Senha123!', 10),
      role: activeRole as any,
      roles: roles as any,
      activeRole: activeRole as any,
    },
  });
  const token = jwt.sign({ id: user.id, role: activeRole }, JWT_SECRET, { expiresIn: '1h' });
  return { user, token };
}

describe('POST /api/auth/switch-role — papéis de equipe', () => {
  it.each(['gerente_lojistas', 'gerente_motoboys'])('%s troca de cliente para o papel de equipe', async (teamRole) => {
    const { user, token } = await createUser(['cliente', teamRole], 'cliente');

    const res = await request(app)
      .post('/api/auth/switch-role')
      .set('Authorization', `Bearer ${token}`)
      .send({ newRole: teamRole });

    expect(res.status).toBe(200);
    expect(res.body.user.activeRole).toBe(teamRole);
    const decoded = jwt.verify(res.body.token, JWT_SECRET) as any;
    expect(decoded.activeRole).toBe(teamRole);
    const saved = await prisma.user.findUnique({ where: { id: user.id } });
    expect(saved!.activeRole).toBe(teamRole);
  });

  it.each(['gerente_lojistas', 'gerente_motoboys'])('cliente sem o papel %s continua recusado', async (teamRole) => {
    const { user, token } = await createUser(['cliente'], 'cliente');

    const res = await request(app)
      .post('/api/auth/switch-role')
      .set('Authorization', `Bearer ${token}`)
      .send({ newRole: teamRole });

    expect(res.status).toBe(403);
    const saved = await prisma.user.findUnique({ where: { id: user.id } });
    expect(saved!.activeRole).toBe('cliente');
  });
});
