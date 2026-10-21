/**
 * D3b-2a · P1.7 — notas internas nas fichas: só acréscimo, com autor e data; quem vê a ficha
 * escreve (user:view_all na pessoa, store:view_all na loja); texto de 1 a 2000 caracteres.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { storeIdForProduct } from './helpers/storeOwner';
import { grantRolePermissions } from './helpers/d3b1Ops';
import { listTimeline } from '../services/adminAccounts/actions';

const DOMAIN = '@d3b2ap17.test';
let ceo: TestUser;
let alvo: TestUser;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  alvo = await createTestUser('cliente', DOMAIN);
});
afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

const userNote = (by: TestUser, id: string, body: Record<string, unknown>) =>
  request(app).post(`/api/admin/users/${id}/notes`).set('Authorization', bearer(by)).send(body);
const storeNote = (by: TestUser, id: string, body: Record<string, unknown>) =>
  request(app).post(`/api/admin/stores/${id}/notes`).set('Authorization', bearer(by)).send(body);

describe('POST /admin/users/:id/notes', () => {
  it('grava a nota com autor e data e devolve o item da linha do tempo', async () => {
    const res = await userNote(ceo, alvo.userId, { text: '  Ligou reclamando do motoboy; pedi print.  ' });
    expect(res.status).toBe(201);
    expect(res.body.item).toMatchObject({
      type: 'note', reason: 'Ligou reclamando do motoboy; pedi print.', meta: null,
      actor: { id: ceo.userId, name: 'User ceo', role: 'ceo' },
    });
    expect(new Date(res.body.item.createdAt).toISOString()).toBe(res.body.item.createdAt);

    const row = await prisma.adminAccountAction.findUniqueOrThrow({ where: { id: res.body.item.id } });
    expect(row).toMatchObject({ userId: alvo.userId, storeId: null, type: 'note', actorId: ceo.userId });
    const { items } = await listTimeline({ userId: alvo.userId });
    expect(items.map((i) => i.id)).toEqual([res.body.item.id]);
  });

  it('texto inválido: 400 NOTE_INVALID; 2000 caracteres passa', async () => {
    for (const body of [{}, { text: '' }, { text: '    ' }, { text: 'x'.repeat(2001) }, { text: 42 }]) {
      const res = await userNote(ceo, alvo.userId, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('NOTE_INVALID');
    }
    expect(await prisma.adminAccountAction.count({ where: { userId: alvo.userId } })).toBe(0);
    expect((await userNote(ceo, alvo.userId, { text: 'x'.repeat(2000) })).status).toBe(201);
  });

  it('pessoa inexistente: 404 USER_NOT_FOUND', async () => {
    const res = await userNote(ceo, 'pessoa-que-nao-existe', { text: 'nota' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });
});

describe('POST /admin/stores/:id/notes', () => {
  it('grava a nota da loja', async () => {
    const storeId = await storeIdForProduct(DOMAIN, 'Loja das notas');
    const res = await storeNote(ceo, storeId, { text: 'Dono pediu para trocar o CNPJ; aguardando documento.' });
    expect(res.status).toBe(201);
    expect(res.body.item).toMatchObject({ type: 'note', reason: 'Dono pediu para trocar o CNPJ; aguardando documento.' });
    const row = await prisma.adminAccountAction.findUniqueOrThrow({ where: { id: res.body.item.id } });
    expect(row).toMatchObject({ storeId, userId: null });
  });

  it('loja inexistente: 404 STORE_NOT_FOUND; texto inválido: 400 NOTE_INVALID', async () => {
    expect((await storeNote(ceo, 'loja-que-nao-existe', { text: 'nota' })).body.code).toBe('STORE_NOT_FOUND');
    const storeId = await storeIdForProduct(DOMAIN, 'Loja inválida');
    expect((await storeNote(ceo, storeId, { text: '' })).body.code).toBe('NOTE_INVALID');
  });
});

describe('permissões e só acréscimo', () => {
  it('quem vê a ficha escreve: user:view_all na pessoa, store:view_all na loja', async () => {
    const storeId = await storeIdForProduct(DOMAIN, 'Loja permissão');
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const restoreRole = await grantRolePermissions('gerente_geral', ['user:view_all']);
    try {
      const pessoa = await userNote(gerente, alvo.userId, { text: 'nota de gerente' });
      expect(pessoa.status).toBe(201);
      expect(pessoa.body.item.actor).toMatchObject({ id: gerente.userId, role: 'gerente_geral' });
      const loja = await storeNote(gerente, storeId, { text: 'nota de gerente' });
      expect(loja.status).toBe(403);
      expect(loja.body.error).toBe('Permissão negada. Você precisa de: store:view_all');

      await grantRolePermissions('gerente_geral', ['store:view_all']);
      expect((await storeNote(gerente, storeId, { text: 'agora pode' })).status).toBe(201);
      expect((await userNote(gerente, alvo.userId, { text: 'sem user:view_all' })).status).toBe(403);
    } finally {
      await restoreRole();
    }
  });

  it('não há rota para editar nem apagar nota', async () => {
    const res = await userNote(ceo, alvo.userId, { text: 'nota fixa' });
    const id = res.body.item.id;
    const put = await request(app).put(`/api/admin/users/${alvo.userId}/notes/${id}`).set('Authorization', bearer(ceo)).send({ text: 'mudei' });
    const del = await request(app).delete(`/api/admin/users/${alvo.userId}/notes/${id}`).set('Authorization', bearer(ceo));
    expect(put.status).toBe(404);
    expect(del.status).toBe(404);
    expect((await prisma.adminAccountAction.findUniqueOrThrow({ where: { id } })).reason).toBe('nota fixa');
  });
});
