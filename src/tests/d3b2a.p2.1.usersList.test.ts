/**
 * D3b-2a · P2.1 — GET /admin/users refeito (spec 6): busca no servidor (nome e e-mail parciais sem
 * diferenciar maiúsculas; CPF e telefone exatos, com ou sem máscara), abas, "Com dívida", cursor
 * estável (createdAt desc, id desc) e as colunas novas. O CPF só serve para a busca.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { createOpsOrder, createOpsStore, grantRolePermissions } from './helpers/d3b1Ops';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { cleanupAccountsFixtures, createDebt, createPerson, daysBefore, randomDigits } from './helpers/d3b2aRead';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';

const DOMAIN = '@d3b2ap21.test';
const MARK = 'd3b2ap21';
const VERIFIED_CLIENT = { email: { status: 'verified' }, document: { type: 'cpf', status: 'approved' } };
let ceo: TestUser;
let tag: string;
let restoreConfig: () => Promise<void>;

beforeAll(async () => {
  restoreConfig = await snapshotPlatformConfig();
});
afterAll(async () => {
  await restoreConfig();
});
beforeEach(async () => {
  await updatePlatformConfig({ settlementMode: 'custodia' }, 'd3b2a-p21');
  ceo = await createTestUser('ceo', DOMAIN);
  tag = `p21${Date.now().toString(36)}${randomDigits(4)}`;
});
afterEach(async () => {
  await cleanupAccountsFixtures(DOMAIN, MARK);
});

const list = (query: Record<string, string>, who: TestUser = ceo) =>
  request(app).get('/api/admin/users').query(query).set('Authorization', bearer(who));
const idsOf = (res: request.Response): string[] => {
  expect(res.body).toEqual(expect.objectContaining({ items: expect.any(Array) }));
  return res.body.items.map((u: { id: string }) => u.id);
};
const sorted = (ids: string[]) => [...ids].sort();
const verificationById = (res: request.Response) =>
  new Map(res.body.items.map((u: { id: string; verification: string }) => [u.id, u.verification]));

describe('GET /admin/users · formato', () => {
  it('responde { items, nextCursor } com as colunas da spec, sem CPF', async () => {
    const now = new Date();
    const cpf = `9${randomDigits(10)}`;
    const lastSeenAt = daysBefore(now, 1);
    const id = await createPerson(DOMAIN, { name: `${tag} Ana`, cpf, verification: VERIFIED_CLIENT, lastSeenAt });
    const storeId = await createOpsStore(DOMAIN, { name: `${tag} Loja` });
    await createOpsOrder({ customerId: id, storeId, createdAt: daysBefore(now, 10) });
    await createOpsOrder({ customerId: id, storeId, createdAt: daysBefore(now, 100) });
    await createDebt(id, 12.5);
    await createDebt(id, 7.5);
    await createDebt(id, 3, 'collected');

    const res = await list({ q: `${tag} Ana` });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: expect.any(Array), nextCursor: null });
    const created = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(res.body.items).toEqual([
      {
        id,
        name: `${tag} Ana`,
        email: created.email,
        roles: ['cliente'],
        status: 'active',
        blockReason: null,
        verification: 'ok',
        lastSeenAt: lastSeenAt.toISOString(),
        orders90d: 1,
        pendingDebt: 20,
        createdAt: created.createdAt.toISOString(),
      },
    ]);
    expect(JSON.stringify(res.body)).not.toContain(cpf);
  });

  it('sem dívida pendente, pendingDebt é null; sem acesso registrado, lastSeenAt é null', async () => {
    const id = await createPerson(DOMAIN, { name: `${tag} Bia` });
    await createDebt(id, 5, 'collected');
    const res = await list({ q: `${tag} Bia` });
    expect(res.body.items).toEqual([
      expect.objectContaining({ id, pendingDebt: null, lastSeenAt: null, orders90d: 0, verification: 'none' }),
    ]);
  });
});

describe('GET /admin/users · verificação por papel', () => {
  it('cliente: ok, pendente, recusada e nada; e-mail ainda não confirmado não conta como pendente', async () => {
    const ok = await createPerson(DOMAIN, { name: `${tag} v-ok`, verification: VERIFIED_CLIENT });
    const pending = await createPerson(DOMAIN, {
      name: `${tag} v-pend`,
      verification: { email: { status: 'verified' }, document: { status: 'pending' } },
    });
    const rejected = await createPerson(DOMAIN, {
      name: `${tag} v-rec`,
      verification: { email: { status: 'verified' }, document: { status: 'rejected', rejectionReason: 'Ilegível' } },
    });
    const none = await createPerson(DOMAIN, {
      name: `${tag} v-nada`,
      verification: { email: { status: 'pending' }, document: { status: 'none' } },
    });
    const by = verificationById(await list({ q: `${tag} v-` }));
    expect(by.get(ok)).toBe('ok');
    expect(by.get(pending)).toBe('pending');
    expect(by.get(rejected)).toBe('rejected');
    expect(by.get(none)).toBe('none');
  });

  it('motoboy exige facial e CNH; lojista exige facial só na custódia', async () => {
    const moto = await createPerson(DOMAIN, {
      name: `${tag} m-moto`,
      roles: ['motoboy', 'cliente'],
      verification: { ...VERIFIED_CLIENT, facial: { status: 'approved' }, courier: { status: 'pending' } },
    });
    const loja = await createPerson(DOMAIN, { name: `${tag} m-loja`, roles: ['lojista', 'cliente'], verification: VERIFIED_CLIENT });

    const custodia = verificationById(await list({ q: `${tag} m-` }));
    expect(custodia.get(moto)).toBe('pending');
    expect(custodia.get(loja)).toBe('none');

    await updatePlatformConfig({ settlementMode: 'direto' }, 'd3b2a-p21');
    const direto = verificationById(await list({ q: `${tag} m-` }));
    expect(direto.get(loja)).toBe('ok');
  });
});

describe('GET /admin/users · busca', () => {
  it('nome e e-mail: parcial e sem diferenciar maiúsculas', async () => {
    const ana = await createPerson(DOMAIN, { name: `${tag} Ana Souza`, email: `${tag}-contato${DOMAIN}` });
    const bruno = await createPerson(DOMAIN, { name: `${tag} Bruno Lima` });
    expect(idsOf(await list({ q: `${tag.toUpperCase()} ana sou` }))).toEqual([ana]);
    expect(idsOf(await list({ q: `${tag}-CONTATO` }))).toEqual([ana]);
    expect(sorted(idsOf(await list({ q: tag })))).toEqual(sorted([ana, bruno]));
  });

  it('CPF: com ou sem máscara acha a pessoa; um pedaço do CPF não acha', async () => {
    const cpf = `9${randomDigits(10)}`;
    const id = await createPerson(DOMAIN, { name: `${tag} Cris`, cpf });
    const masked = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
    expect(idsOf(await list({ q: masked }))).toEqual([id]);
    expect(idsOf(await list({ q: cpf }))).toEqual([id]);
    expect(idsOf(await list({ q: ` ${masked} ` }))).toEqual([id]);
    expect(idsOf(await list({ q: masked.slice(0, 7) }))).not.toContain(id);
  });

  it('telefone: gravado com máscara ou com DDI, achado digitando de qualquer jeito', async () => {
    const n1 = `9${randomDigits(8)}`;
    const n2 = `9${randomDigits(8)}`;
    const comMascara = await createPerson(DOMAIN, { name: `${tag} Fone1`, telefone: `(11) ${n1.slice(0, 5)}-${n1.slice(5)}` });
    const comDdi = await createPerson(DOMAIN, { name: `${tag} Fone2`, telefone: `+5521${n2}` });
    expect(idsOf(await list({ q: `11${n1}` }))).toEqual([comMascara]);
    expect(idsOf(await list({ q: `+55 (11) ${n1}` }))).toEqual([comMascara]);
    expect(idsOf(await list({ q: `(21) ${n2.slice(0, 5)}-${n2.slice(5)}` }))).toEqual([comDdi]);
    expect(idsOf(await list({ q: n1.slice(0, 5) }))).not.toContain(comMascara);
  });

  it('nome com números continua sendo busca por nome', async () => {
    const id = await createPerson(DOMAIN, { name: `${tag} Loja 2024 Ltda` });
    expect(idsOf(await list({ q: `${tag} Loja 2024` }))).toEqual([id]);
  });
});

describe('GET /admin/users · abas e "Com dívida"', () => {
  it('cada aba traz só quem é dela, inclusive conta antiga com o papel só em role', async () => {
    const cliente = await createPerson(DOMAIN, { name: `${tag} cliente` });
    const lojista = await createPerson(DOMAIN, { name: `${tag} lojista`, roles: ['lojista', 'cliente'], role: 'lojista', activeRole: 'lojista' });
    const lojistaAntigo = await createPerson(DOMAIN, { name: `${tag} antigo`, roles: ['cliente'], role: 'lojista' });
    const motoboy = await createPerson(DOMAIN, { name: `${tag} motoboy`, roles: ['motoboy', 'cliente'], activeRole: 'motoboy' });
    const equipe = await createPerson(DOMAIN, { name: `${tag} equipe`, roles: ['cliente', 'gerente_geral'] });
    const bloqueado = await createPerson(DOMAIN, { name: `${tag} bloqueado`, status: 'blocked', blockReason: 'Fraude no cupom' });

    const tab = async (t: string) => sorted(idsOf(await list({ q: tag, tab: t })));
    expect(await tab('all')).toEqual(sorted([cliente, lojista, lojistaAntigo, motoboy, equipe, bloqueado]));
    expect(await tab('cliente')).toEqual(sorted([cliente, bloqueado]));
    expect(await tab('lojista')).toEqual(sorted([lojista, lojistaAntigo]));
    expect(await tab('motoboy')).toEqual([motoboy]);
    expect(await tab('equipe')).toEqual([equipe]);
    expect(await tab('bloqueados')).toEqual([bloqueado]);

    const blocked = (await list({ q: `${tag} bloqueado` })).body.items[0];
    expect(blocked).toEqual(expect.objectContaining({ status: 'blocked', blockReason: 'Fraude no cupom' }));
    const antigo = (await list({ q: `${tag} antigo` })).body.items[0];
    expect(sorted(antigo.roles)).toEqual(['cliente', 'lojista']);
  });

  it('aba desconhecida responde 400 INVALID_FILTER', async () => {
    const res = await list({ tab: 'vips' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Filtro inválido', code: 'INVALID_FILTER' });
  });

  it('withDebt=1 traz só quem tem dívida pendente', async () => {
    const devedor = await createPerson(DOMAIN, { name: `${tag} devedor` });
    const quitado = await createPerson(DOMAIN, { name: `${tag} quitado` });
    await createPerson(DOMAIN, { name: `${tag} limpo` });
    await createDebt(devedor, 9.9);
    await createDebt(quitado, 4, 'collected');
    const res = await list({ q: tag, withDebt: '1' });
    expect(idsOf(res)).toEqual([devedor]);
    expect(res.body.items[0].pendingDebt).toBe(9.9);
  });
});

describe('GET /admin/users · cursor', () => {
  it('empate de createdAt não repete nem pula ninguém entre páginas', async () => {
    const same = new Date(Date.now() - 60_000);
    const tied: string[] = [];
    for (let i = 0; i < 5; i++) tied.push(await createPerson(DOMAIN, { name: `${tag} empate ${i}`, createdAt: same }));
    const older = await createPerson(DOMAIN, { name: `${tag} mais antigo`, createdAt: new Date(same.getTime() - 60_000) });

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const res = await list(cursor ? { q: tag, limit: '2', cursor } : { q: tag, limit: '2' });
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeLessThanOrEqual(2);
      seen.push(...idsOf(res));
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);
    expect(sorted(seen.slice(0, 5))).toEqual(sorted(tied));
    expect(seen[5]).toBe(older);
  });

  it('cursor inválido responde 400 INVALID_CURSOR', async () => {
    const res = await list({ cursor: 'nao-e-cursor' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CURSOR');
  });
});

describe('GET /admin/users · permissão', () => {
  it('cliente recebe 403', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    expect((await list({}, cliente)).status).toBe(403);
  });

  it('papel delegado: 403 sem user:view_all e 200 com ela', async () => {
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const restore = await grantRolePermissions('gerente_geral', ['store:view_all']);
    try {
      expect((await list({}, gerente)).status).toBe(403);
      await grantRolePermissions('gerente_geral', ['user:view_all']);
      const ok = await list({}, gerente);
      expect(ok.status).toBe(200);
      expect(ok.body).toEqual(expect.objectContaining({ items: expect.any(Array) }));
    } finally {
      await restore();
    }
  });
});
