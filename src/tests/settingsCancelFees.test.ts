import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../app';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';

afterEach(async () => {
  await cleanupUsersByEmailDomain('@setcfg.test');
});

async function createUser(role: string) {
  const passwordHash = await bcrypt.hash('Senha123!', 10);
  const roles = role !== 'cliente' ? [role, 'cliente'] : ['cliente'];
  const user = await prisma.user.create({
    data: {
      name: `${role} test`,
      email: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@setcfg.test`,
      passwordHash,
      role: role as Role,
      roles: roles as Role[],
      activeRole: role as Role,
    },
  });
  const token = jwt.sign(
    { id: user.id, role, activeRole: role, roles },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  return { user, token, id: user.id };
}

describe('PUT /api/settings/platform-config — taxas de cancelamento e timeouts', () => {
  it('salva cancelFeeStorePercent e devolve 7 no GET seguinte', async () => {
    const ceo = await createUser('ceo');

    const putRes = await request(app)
      .put('/api/settings/platform-config')
      .set('Authorization', `Bearer ${ceo.token}`)
      .send({ cancelFeeStorePercent: 7 });

    expect(putRes.status).toBe(200);

    const getRes = await request(app).get('/api/settings/platform-config');
    expect(getRes.status).toBe(200);
    // cancelFeeStorePercent é Decimal no schema; DECIMAL_FIELDS (platformConfig.repository.ts)
    // converte na fronteira, então deve voltar como number de verdade, não string.
    expect(typeof getRes.body.cancelFeeStorePercent).toBe('number');
    expect(getRes.body.cancelFeeStorePercent).toBe(7);
  });

  it('salva poolTimeoutMin e devolve 20 no GET seguinte', async () => {
    const ceo = await createUser('ceo');

    const putRes = await request(app)
      .put('/api/settings/platform-config')
      .set('Authorization', `Bearer ${ceo.token}`)
      .send({ poolTimeoutMin: 20 });

    expect(putRes.status).toBe(200);

    const getRes = await request(app).get('/api/settings/platform-config');
    expect(getRes.status).toBe(200);
    // poolTimeoutMin é Int no schema — Prisma já devolve number nativamente.
    expect(typeof getRes.body.poolTimeoutMin).toBe('number');
    expect(getRes.body.poolTimeoutMin).toBe(20);
  });
});
