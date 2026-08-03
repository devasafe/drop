import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';

afterEach(async () => { await cleanupUsersByEmailDomain('@avail.test'); });

async function motoboy() {
  const user = await prisma.user.create({
    data: {
      name: 'Moto', email: `m-${Date.now()}-${Math.random().toString(36).slice(2)}@avail.test`,
      passwordHash: await bcrypt.hash('Senha123!', 10),
      role: 'motoboy', roles: ['motoboy'], activeRole: 'motoboy', isOnline: false,
    },
  });
  const token = jwt.sign({ id: user.id, role: 'motoboy', activeRole: 'motoboy', roles: ['motoboy'] }, JWT_SECRET);
  return { user, token };
}

describe('disponibilidade do motoboy', () => {
  it('GET reflete o estado; POST alterna', async () => {
    const { token } = await motoboy();

    const g0 = await request(app).get('/api/deliveries/availability').set('Authorization', `Bearer ${token}`);
    expect(g0.status).toBe(200);
    expect(g0.body.isOnline).toBe(false);

    const p = await request(app).post('/api/deliveries/availability').set('Authorization', `Bearer ${token}`).send({ isOnline: true });
    expect(p.status).toBe(200);
    expect(p.body.isOnline).toBe(true);

    const g1 = await request(app).get('/api/deliveries/availability').set('Authorization', `Bearer ${token}`);
    expect(g1.body.isOnline).toBe(true);
  });

  it('POST rejeita body inválido', async () => {
    const { token } = await motoboy();
    const r = await request(app).post('/api/deliveries/availability').set('Authorization', `Bearer ${token}`).send({ isOnline: 'sim' });
    expect(r.status).toBe(400);
  });
});
