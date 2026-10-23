/** D3b-4a · T4: leitura do histórico de regras (spec 5.5). */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@d3b4at4.test';
let ceo: TestUser;
let outro: TestUser;
let cliente: TestUser;
beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  outro = await createTestUser('ceo', DOMAIN);
  cliente = await createTestUser('cliente', DOMAIN);
});
afterEach(() => cleanupUsersByEmailDomain(DOMAIN));

const linha = (actorId: string, field: string, createdAt: Date, batchId = `b-${field}-${createdAt.getTime()}`) =>
  prisma.platformRuleChange.create({ data: { batchId, source: 'rules', field, before: 1, after: 2, actorId, actorRole: 'ceo', reason: 'r', createdAt } });
const get = (who: TestUser, qs = '') => request(app).get(`/api/admin/rules/history${qs}`).set('Authorization', bearer(who));

it('lista mais recente primeiro, com nome do ator; filtra por campo, pessoa e dia de São Paulo', async () => {
  await linha(ceo.userId, 'poolTimeoutMin', new Date('2026-10-20T15:00:00Z'));
  await linha(outro.userId, 'cardFeeFixed', new Date('2026-10-21T02:30:00Z')); // 20/10 23:30 em SP
  await linha(ceo.userId, 'cardFeeFixed', new Date('2026-10-22T12:00:00Z'));

  const all = await get(ceo, `?actorId=${ceo.userId}`);
  expect(all.status).toBe(200);
  expect(all.body.items.map((i: any) => i.field)).toEqual(['cardFeeFixed', 'poolTimeoutMin']);
  expect(all.body.items[0]).toMatchObject({ actorId: ceo.userId, actorName: expect.any(String), before: 1, after: 2, reason: 'r', source: 'rules' });

  expect((await get(ceo, '?field=cardFeeFixed&from=2026-10-20&to=2026-10-20')).body.items.map((i: any) => i.actorId)).toEqual([outro.userId]);
});

it('pagina de 50 com cursor', async () => {
  for (let i = 0; i < 52; i++) await linha(ceo.userId, 'poolTimeoutMin', new Date(Date.UTC(2026, 9, 1, 0, i)));
  const p1 = await get(ceo, `?actorId=${ceo.userId}`);
  expect(p1.body.items).toHaveLength(50);
  const p2 = await get(ceo, `?actorId=${ceo.userId}&cursor=${encodeURIComponent(p1.body.nextCursor)}`);
  expect(p2.body.items).toHaveLength(2);
  expect(p2.body.nextCursor).toBeNull();
});

it('campo fora da lista ou data inválida → 400; sem settings:manage → 403', async () => {
  expect((await get(ceo, '?field=inventado')).status).toBe(400);
  expect((await get(ceo, '?from=2026-02-31')).status).toBe(400);
  expect((await get(cliente)).status).toBe(403);
});
