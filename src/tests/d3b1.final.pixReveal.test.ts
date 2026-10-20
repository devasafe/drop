/**
 * D3b-1 · correções finais (item A) — "Ver chave" do Pix manual do DROP.
 * GET /api/admin/transfers/:id/pix-key devolve a chave completa só para o Pix manual do DROP
 * ainda não pago (payer platform + PLATFORM_MANUAL_PIX + status != done), exige payout:release
 * e grava motoboy_transfer_pix_reveal ANTES de responder, sem a chave em nenhum campo.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import * as moneyActions from '../services/adminMoneyAction.service';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@d3b1pixkey.test';
const CPF = '98765432100';

let seq = 0;
let ceo: TestUser;
let motoboy: TestUser;
let storeId: string;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  motoboy = await createTestUser('motoboy', DOMAIN);
  const owner = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: owner.userId, name: 'Loja PixKey', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any });
  storeId = store.id;
});

afterEach(async () => {
  jest.restoreAllMocks();
  const transfers = await prisma.motoboyTransfer.findMany({ where: { orderId: { startsWith: 'ordpk' } }, select: { id: true } });
  await prisma.adminMoneyAction.deleteMany({ where: { targetId: { in: transfers.map((t) => t.id) } } });
  await prisma.motoboyTransfer.deleteMany({ where: { orderId: { startsWith: 'ordpk' } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

const mk = (extra: any = {}) =>
  prisma.motoboyTransfer.create({
    data: {
      deliveryId: `delpk-${Date.now()}-${seq}`, orderId: `ordpk-${seq++}`, storeId, motoboyId: motoboy.userId,
      amount: 12.5, pixKeyEncrypted: encryptSensitiveData(CPF), pixKeyType: 'CPF',
      payer: 'platform', status: 'failed_final', lastError: 'PLATFORM_MANUAL_PIX', ...extra,
    },
  });

const reveal = (u: TestUser, id: string) => request(app).get(`/api/admin/transfers/${id}/pix-key`).set('Authorization', bearer(u));

describe('GET /api/admin/transfers/:id/pix-key', () => {
  it('CEO recebe a chave do Pix manual e a auditoria fica gravada sem a chave', async () => {
    const t = await mk();
    const r = await reveal(ceo, t.id);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ pixKey: CPF, pixKeyType: 'CPF', motoboyName: expect.any(String), amount: 12.5 });
    expect(r.body.data.motoboyName.length).toBeGreaterThan(0);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers.pragma).toBe('no-cache');

    const rows = await prisma.adminMoneyAction.findMany({ where: { targetId: t.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: ceo.userId, actorRole: 'ceo', type: 'motoboy_transfer_pix_reveal', targetType: 'motoboy_transfer' });
    expect(Number(rows[0].amount)).toBe(12.5);
    expect(JSON.stringify(rows[0])).not.toContain(CPF);
  });

  it('sem payout:release → 403 e sem auditoria', async () => {
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const t = await mk();
    const r = await reveal(gerente, t.id);
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).not.toContain(CPF);
    expect(await prisma.adminMoneyAction.count({ where: { targetId: t.id } })).toBe(0);
  });

  it('transferência da loja → 409 PIX_KEY_NOT_REVEALABLE', async () => {
    const t = await mk({ payer: 'store', lastError: 'ASAAS_ERROR' });
    const r = await reveal(ceo, t.id);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('PIX_KEY_NOT_REVEALABLE');
    expect(JSON.stringify(r.body)).not.toContain(CPF);
    expect(await prisma.adminMoneyAction.count({ where: { targetId: t.id } })).toBe(0);
  });

  it('Pix manual já pago (done) → 409', async () => {
    const t = await mk({ status: 'done' });
    const r = await reveal(ceo, t.id);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('PIX_KEY_NOT_REVEALABLE');
    expect(JSON.stringify(r.body)).not.toContain(CPF);
  });

  it('inexistente → 404', async () => {
    const r = await reveal(ceo, 'nao-existe');
    expect(r.status).toBe(404);
  });

  it('se gravar a auditoria falha → 500 e a chave não sai', async () => {
    const t = await mk();
    jest.spyOn(moneyActions, 'recordAdminMoneyAction').mockRejectedValueOnce(new Error('falha ao gravar a linha'));
    const r = await reveal(ceo, t.id);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain(CPF);
  });
});
