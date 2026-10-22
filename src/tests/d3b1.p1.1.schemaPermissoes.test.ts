/**
 * D3b-1 · P1.1 — fundação da Operação ao vivo: schema (AdminOrderAction, culpa e autor no
 * Cancellation, motoboys excluídos na Delivery, tipo de dinheiro do cancelamento do admin), as três
 * permissões novas (só CEO por padrão, delegáveis) e a limpeza de AdminOrderAction nos testes.
 */
import request from 'supertest';
import { AdminMoneyActionType, AdminOrderActionType, AppCashboxSource, CancellationFault, TransferPayer } from '@prisma/client';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { storeIdForProduct } from './helpers/storeOwner';
import { ALL_PERMISSIONS, CEO_ONLY_PERMISSIONS, getEffectivePermissions } from '../controllers/rolePermissionsController';
import { hasPermission, rolePermissions } from '../utils/walletCalculations';

const DOMAIN = '@d3b1p11.test';
const OPS_PERMISSIONS = ['operation:view', 'order:admin_cancel', 'order:reassign'];
let ceo: TestUser;
let cliente: TestUser;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  cliente = await createTestUser('cliente', DOMAIN);
});
afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function createOrder(): Promise<string> {
  const storeId = await storeIdForProduct(DOMAIN, 'Loja P1.1');
  const order = await prisma.order.create({
    data: { customerId: cliente.userId, storeId, totalValue: 30, deliveryFee: 10, status: 'pago', paymentStatus: 'paid' },
  });
  return order.id;
}

describe('schema da D3b-1', () => {
  it('enums novos e o tipo de dinheiro do cancelamento do admin', () => {
    expect(Object.values(CancellationFault).sort()).toEqual(['customer', 'motoboy', 'platform', 'store']);
    expect(Object.values(AdminOrderActionType).sort()).toEqual(['cancel', 'reassign']);
    expect(Object.values(AdminMoneyActionType)).toContain('order_admin_cancel');
    expect(Object.values(AppCashboxSource)).toContain('admin_cancel_compensation');
    expect(Object.values(TransferPayer).sort()).toEqual(['platform', 'store']);
  });

  it('MotoboyTransfer nasce com payer store e aceita platform (Pix manual do DROP)', async () => {
    const orderId = await createOrder();
    const base = { orderId, storeId: 'loja-p11', motoboyId: cliente.userId, amount: 10, pixKeyEncrypted: 'x', pixKeyType: 'cpf' };
    try {
      const daLoja = await prisma.motoboyTransfer.create({ data: { ...base, deliveryId: `d3b1p11-a-${Date.now()}` } });
      expect(daLoja.payer).toBe('store');
      const doDrop = await prisma.motoboyTransfer.create({
        data: { ...base, deliveryId: `d3b1p11-b-${Date.now()}`, payer: 'platform', reason: 'compensation' },
      });
      expect(doDrop.payer).toBe('platform');
    } finally {
      await prisma.motoboyTransfer.deleteMany({ where: { orderId } });
    }
  });

  it('AdminOrderAction grava ação, autor, motivo, culpa e detalhes', async () => {
    const orderId = await createOrder();
    const cancel = await prisma.adminOrderAction.create({
      data: {
        orderId, action: 'cancel', actorId: ceo.userId, actorRole: 'ceo',
        reason: 'Loja fechou sem avisar', faultParty: 'store', details: { refundAmount: 30 },
      },
    });
    expect(cancel.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(cancel.createdAt).toBeInstanceOf(Date);
    expect(cancel.details).toEqual({ refundAmount: 30 });

    const reassign = await prisma.adminOrderAction.create({
      data: { orderId, action: 'reassign', actorId: ceo.userId, actorRole: 'ceo', reason: 'Motoboy parado' },
    });
    expect(reassign.faultParty).toBeNull();
    expect(reassign.details).toBeNull();
  });

  it('Cancellation guarda culpa e admin; Delivery nasce sem motoboys excluídos', async () => {
    const orderId = await createOrder();
    const byAdmin = await prisma.cancellation.create({
      data: { orderId, cancelledBy: 'admin', reason: 'Problema no app', reasonCode: 'other', faultParty: 'platform', adminId: ceo.userId },
    });
    expect(byAdmin.faultParty).toBe('platform');
    expect(byAdmin.adminId).toBe(ceo.userId);

    const old = await prisma.cancellation.create({
      data: { orderId, cancelledBy: 'customer', reason: 'Desisti', reasonCode: 'customer_request' },
    });
    expect(old.faultParty).toBeNull();
    expect(old.adminId).toBeNull();

    const delivery = await prisma.delivery.create({ data: { orderId, fee: 10, status: 'pending' } });
    expect(delivery.excludedMotoboyIds).toEqual([]);
    const updated = await prisma.delivery.update({
      where: { id: delivery.id },
      data: { excludedMotoboyIds: { push: 'motoboy-1' } },
    });
    expect(updated.excludedMotoboyIds).toEqual(['motoboy-1']);
  });
});

describe('cleanupUsersByEmailDomain', () => {
  it('apaga as AdminOrderAction dos pedidos da suíte e as feitas pelos usuários da suíte', async () => {
    const orderId = await createOrder();
    await prisma.adminOrderAction.create({
      data: { orderId, action: 'reassign', actorId: 'ator-de-fora', actorRole: 'ceo', reason: 'teste da limpeza' },
    });
    const foreignOrderId = `pedido-de-fora-${Date.now()}`;
    await prisma.adminOrderAction.create({
      data: { orderId: foreignOrderId, action: 'cancel', actorId: ceo.userId, actorRole: 'ceo', reason: 'teste da limpeza' },
    });

    await cleanupUsersByEmailDomain(DOMAIN);

    expect(await prisma.adminOrderAction.count({ where: { orderId } })).toBe(0);
    expect(await prisma.adminOrderAction.count({ where: { orderId: foreignOrderId } })).toBe(0);
  });
});

describe('permissões da Operação', () => {
  it('estão no catálogo no grupo "Operação", só o CEO tem por padrão e são delegáveis', () => {
    // Permissões por público (22/10): o catálogo ganhou kind/area/requires (o que a caixinha libera); confere só os campos de antes.
    // Parte 2 (22/10): os grupos da tela Permissões seguem o menu do admin (category = grupo do menu).
    expect(ALL_PERMISSIONS.filter((p) => p.area === 'operacao')).toMatchObject([
      { key: 'operation:view', label: 'Ver a operação ao vivo (fila, pedidos e mapa)', category: 'Operação ao vivo' },
      { key: 'order:admin_cancel', label: 'Cancelar pedido com estorno, escolhendo a culpa', category: 'Operação ao vivo' },
      { key: 'order:reassign', label: 'Reatribuir o motoboy de um pedido antes da retirada', category: 'Operação ao vivo' },
    ]);
    for (const key of OPS_PERMISSIONS) {
      expect(hasPermission('ceo', key)).toBe(true);
      for (const role of Object.keys(rolePermissions).filter((r) => r !== 'ceo')) {
        expect(rolePermissions[role]).not.toContain(key);
      }
      expect(CEO_ONLY_PERMISSIONS).not.toContain(key);
    }
  });

  it('o catálogo chega ao painel e o CEO concede as três a um gerente em Permissões', async () => {
    const list = await request(app).get('/api/role-permissions').set('Authorization', bearer(ceo));
    expect(list.status).toBe(200);
    const keys = list.body.allPermissions.map((p: any) => p.key);
    for (const key of OPS_PERMISSIONS) expect(keys).toContain(key);

    const previous = await prisma.rolePermissions.findUnique({ where: { role: 'gerente_geral' } });
    try {
      const base = (await getEffectivePermissions('gerente_geral')).permissions;
      const r = await request(app)
        .put('/api/role-permissions/gerente_geral')
        .set('Authorization', bearer(ceo))
        .send({ permissions: [...base, ...OPS_PERMISSIONS], notificationTargets: [] });
      expect(r.status).toBe(200);
      const effective = (await getEffectivePermissions('gerente_geral')).permissions;
      for (const key of OPS_PERMISSIONS) expect(effective).toContain(key);
    } finally {
      if (previous) {
        await prisma.rolePermissions.update({
          where: { role: 'gerente_geral' },
          data: { permissions: previous.permissions, notificationTargets: previous.notificationTargets, updatedBy: previous.updatedBy },
        });
      } else {
        await prisma.rolePermissions.deleteMany({ where: { role: 'gerente_geral' } });
      }
    }
  });
});
