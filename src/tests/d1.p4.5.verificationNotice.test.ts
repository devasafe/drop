/** D1 · P4.5 — a decisão do admin sobre CNPJ/endereço chega ao dono da loja, com o motivo. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@d1p45.test';

async function wipeNotifications() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  await prisma.notification.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
}
afterEach(async () => { await wipeNotifications(); await cleanupUsersByEmailDomain(DOMAIN); });
afterAll(async () => { await prisma.$disconnect(); });

async function setup() {
  const ceo = await createTestUser('ceo', DOMAIN);
  const dono = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({
    data: {
      ownerId: dono.userId, name: 'Loja P45', isOpen: true, isVerified: false,
      verification: { cnpj: { status: 'pending', number: '11444777000161' }, address: { status: 'pending', comprovanteUrl: 'x' } },
    } as any,
  });
  return { ceo, dono, store };
}

describe('P4.5 — aviso da verificação da loja', () => {
  it('CNPJ aprovado → aviso "CNPJ aprovado" com link /seller/abrir', async () => {
    const { ceo, dono, store } = await setup();
    const r = await request(app).post(`/api/verification/admin/store/${store.id}/cnpj/approve`).set('Authorization', bearer(ceo));
    expect(r.status).toBe(200);
    const n = await prisma.notification.findFirst({ where: { userId: dono.userId, entityId: store.id } });
    expect(n).toMatchObject({ title: 'CNPJ aprovado', link: '/seller/abrir', type: 'system', read: false });
  });

  it('endereço recusado → aviso "Endereço recusado" com o motivo do admin', async () => {
    const { ceo, dono, store } = await setup();
    const r = await request(app)
      .post(`/api/verification/admin/store/${store.id}/address/reject`)
      .set('Authorization', bearer(ceo))
      .send({ reason: 'Comprovante ilegível' });
    expect(r.status).toBe(200);
    const n = await prisma.notification.findFirst({ where: { userId: dono.userId, entityId: store.id } });
    expect(n).toMatchObject({ title: 'Endereço recusado', link: '/seller/abrir' });
    expect(n!.message).toContain('Comprovante ilegível');
  });

  it('recusa sem motivo usa "Não aprovado"', async () => {
    const { ceo, dono, store } = await setup();
    await request(app).post(`/api/verification/admin/store/${store.id}/cnpj/reject`).set('Authorization', bearer(ceo)).send({});
    const n = await prisma.notification.findFirst({ where: { userId: dono.userId, entityId: store.id } });
    expect(n).toMatchObject({ title: 'CNPJ recusado' });
    expect(n!.message).toContain('Não aprovado');
  });

  it('item que não estava pendente (400) não gera aviso', async () => {
    const { ceo, dono, store } = await setup();
    await request(app).post(`/api/verification/admin/store/${store.id}/cnpj/approve`).set('Authorization', bearer(ceo));
    const again = await request(app).post(`/api/verification/admin/store/${store.id}/cnpj/approve`).set('Authorization', bearer(ceo));
    expect(again.status).toBe(400);
    expect(await prisma.notification.count({ where: { userId: dono.userId, entityId: store.id } })).toBe(1);
  });
});
