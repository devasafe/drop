/**
 * fix/criar-loja-painel: criar uma 2ª loja respondia 400 "User already has a store" (inglês, sem code).
 * A tela de criação pode estar com a leitura velha (painel sem a loja) e tentar criar de novo:
 * agora é 409 STORE_EXISTS com texto em português, para a tela tratar como etapa já feita.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@lojadup.test';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

test('dono que já tem loja: 409 STORE_EXISTS em português e nenhuma loja nova', async () => {
  const dono = await createTestUser('lojista', DOMAIN);
  await prisma.store.create({ data: { ownerId: dono.userId, name: 'Primeira' } });

  const res = await request(app).post('/api/stores').set('Authorization', bearer(dono)).send({ name: 'Segunda' });

  expect(res.status).toBe(409);
  expect(res.body).toEqual({ error: 'Você já tem uma loja.', code: 'STORE_EXISTS' });
  expect(await prisma.store.count({ where: { ownerId: dono.userId } })).toBe(1);
});
