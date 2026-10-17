import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';

// D3a · correção V1, revista em 16/10: papel de equipe deixou de ser área (vira acréscimo);
// a troca de área segue valendo só para os papéis-base.
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
  // Regra mudou de propósito (16/10): papel de equipe é acréscimo às permissões da conta,
  // não uma área. A troca para gerente_* (aceita na V1) passa a ser recusada; lojista e
  // motoboy continuam trocando de área normalmente.
  it.each(['lojista', 'motoboy'])('cliente com o papel %s continua trocando de área', async (baseRole) => {
    const { user, token } = await createUser(['cliente', baseRole], 'cliente');

    const res = await request(app)
      .post('/api/auth/switch-role')
      .set('Authorization', `Bearer ${token}`)
      .send({ newRole: baseRole });

    expect(res.status).toBe(200);
    expect(res.body.user.activeRole).toBe(baseRole);
    const decoded = jwt.verify(res.body.token, JWT_SECRET) as any;
    expect(decoded.activeRole).toBe(baseRole);
    const saved = await prisma.user.findUnique({ where: { id: user.id } });
    expect(saved!.activeRole).toBe(baseRole);
  });

  it.each(['gerente_lojistas', 'gerente_motoboys', 'gerente_geral', 'gerente_clientes'])(
    '%s não é mais área: troca recusada com 400 TEAM_ROLE_NOT_SWITCHABLE',
    async (teamRole) => {
      const { user, token } = await createUser(['cliente', teamRole], 'cliente');

      const res = await request(app)
        .post('/api/auth/switch-role')
        .set('Authorization', `Bearer ${token}`)
        .send({ newRole: teamRole });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('TEAM_ROLE_NOT_SWITCHABLE');
      const saved = await prisma.user.findUnique({ where: { id: user.id } });
      expect(saved!.activeRole).toBe('cliente');
    },
  );
});
