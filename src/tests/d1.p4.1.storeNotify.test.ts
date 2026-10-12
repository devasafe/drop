// src/tests/d1.p4.1.storeNotify.test.ts
/** D1 · P4.1 — notificação da loja com link e entidade (sino + push). */
jest.mock('../services/pushService', () => {
  const actual = jest.requireActual('../services/pushService');
  return { __esModule: true, ...actual, sendPushToUser: jest.fn(async () => {}) };
});

import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { sendPushToUser } from '../services/pushService';
import { notifyStore, STORE_LINKS } from '../services/storeNotify';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@d1p41.test';
const push = sendPushToUser as jest.Mock;

async function wipeNotifications() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  await prisma.notification.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
}

beforeEach(() => push.mockClear());
afterEach(async () => {
  await wipeNotifications();
  await cleanupUsersByEmailDomain(DOMAIN);
});
afterAll(async () => { await prisma.$disconnect(); });

async function setup() {
  const dono = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P41', isOpen: true } });
  return { dono, store };
}

describe('P4.1 — notifyStore', () => {
  it('links fixos do painel da loja', () => {
    expect(STORE_LINKS.order('abc')).toBe('/seller/pedido/abc');
    expect(STORE_LINKS.verification).toBe('/seller/abrir');
    expect(STORE_LINKS.money).toBe('/seller/dinheiro');
    expect(STORE_LINKS.dashboard).toBe('/seller/dashboard');
    expect(STORE_LINKS.ratings).toBe('/seller/avaliacoes');
  });

  it('grava a notificação do DONO com link e entityId e manda o push com o mesmo link', async () => {
    const { dono, store } = await setup();
    await notifyStore(store.id, {
      title: 'Novo pedido', message: 'Você recebeu um pedido novo.',
      link: STORE_LINKS.order('ord-p41'), entityId: 'ord-p41', type: 'order', tag: 'novo-pedido',
    });
    const rows = await prisma.notification.findMany({ where: { userId: dono.userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: 'Novo pedido', message: 'Você recebeu um pedido novo.',
      link: '/seller/pedido/ord-p41', entityId: 'ord-p41', type: 'order', read: false,
    });
    expect(push).toHaveBeenCalledWith(dono.userId, expect.objectContaining({
      title: 'Novo pedido', body: 'Você recebeu um pedido novo.', url: '/seller/pedido/ord-p41', tag: 'novo-pedido',
    }));
  });

  it('dedupe: mesma entidade e mesmo título não duplicam', async () => {
    const { dono, store } = await setup();
    const n = { title: 'Novo pedido', message: 'x', link: STORE_LINKS.order('o1'), entityId: 'o1', dedupe: true };
    await notifyStore(store.id, n);
    await notifyStore(store.id, n);
    expect(await prisma.notification.count({ where: { userId: dono.userId } })).toBe(1);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('sem dedupe: o mesmo aviso grava de novo (ex.: documento recusado duas vezes)', async () => {
    const { dono, store } = await setup();
    const n = { title: 'CNPJ recusado', message: 'Motivo: x', link: STORE_LINKS.verification, entityId: store.id };
    await notifyStore(store.id, n);
    await notifyStore(store.id, n);
    expect(await prisma.notification.count({ where: { userId: dono.userId } })).toBe(2);
  });

  it('loja inexistente ou id vazio: não lança e não grava nada', async () => {
    await expect(notifyStore('nao-existe', { title: 't', message: 'm', link: '/x' })).resolves.toBeUndefined();
    await expect(notifyStore(null, { title: 't', message: 'm', link: '/x' })).resolves.toBeUndefined();
    expect(push).not.toHaveBeenCalled();
  });

  it('GET /api/notifications devolve link e entityId', async () => {
    const { dono, store } = await setup();
    await notifyStore(store.id, { title: 'Pedido cancelado', message: 'm', link: STORE_LINKS.order('o9'), entityId: 'o9' });
    const r = await request(app).get('/api/notifications').set('Authorization', bearer(dono));
    expect(r.status).toBe(200);
    const item = r.body.find((n: any) => n.entityId === 'o9');
    expect(item).toMatchObject({ link: '/seller/pedido/o9', entityId: 'o9', title: 'Pedido cancelado' });
    expect(item._id).toBe(item.id);
  });

  it('MotoboyTransfer tem a coluna firstFailedAt (nula por padrão)', async () => {
    const { store } = await setup();
    const t = await prisma.motoboyTransfer.create({
      data: { deliveryId: `del-p41-${Date.now()}`, orderId: 'ord-p41-t', storeId: store.id, motoboyId: 'm-p41', amount: 8, pixKeyEncrypted: '', pixKeyType: '' },
    });
    expect(t.firstFailedAt).toBeNull();
    await prisma.motoboyTransfer.delete({ where: { id: t.id } });
  });
});
