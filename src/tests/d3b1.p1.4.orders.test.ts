/**
 * D3b-1 · P1.4 — GET /admin/orders (Pedidos ao vivo, spec 3.2): motivo de atenção na linha, filtros,
 * loja, cursor, KPIs (meta) e nada de PIN, CPF ou e-mail.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { createOpsStore, createOpsOrder, cleanupOpsFixtures, grantRolePermissions, OpsOrderInput } from './helpers/d3b1Ops';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { listAdminOrders } from '../services/adminOps/orders';
import { saoPauloDayRange } from '../services/moneyOverview.service';

const DOMAIN = '@d3b1p14.test';
const MARK = 'd3b1p14';
const PIN_ENTREGA = '73914';
const PIN_RETIRADA = '82605';
const CPF = '39053344705';

let restoreConfig: () => Promise<void>;
let ceo: TestUser;
let cliente: TestUser;
let motoboy: TestUser;
let storeId: string;

beforeAll(async () => {
  restoreConfig = await snapshotPlatformConfig();
});
afterAll(async () => {
  await restoreConfig();
});
beforeEach(async () => {
  await updatePlatformConfig({ storeAcceptTimeoutMin: 10, poolTimeoutMin: 15 }, 'test');
  ceo = await createTestUser('ceo', DOMAIN);
  cliente = await createTestUser('cliente', DOMAIN);
  await prisma.user.update({ where: { id: cliente.userId }, data: { cpf: CPF } });
  motoboy = await createTestUser('motoboy', DOMAIN);
  storeId = await createOpsStore(DOMAIN, { name: 'Loja Lista' });
});
afterEach(async () => {
  await cleanupOpsFixtures(DOMAIN, MARK);
});

// "Hoje" fixo (10/03/2026, 12:00 em São Paulo): o teste não fica instável perto da meia-noite.
const NOW = new Date('2026-03-10T15:00:00.000Z');
const ago = (m: number) => new Date(NOW.getTime() - m * 60_000);
const order = (data: Partial<OpsOrderInput>) => createOpsOrder({ customerId: cliente.userId, storeId, ...data });
const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();
const get = (u: TestUser | undefined, query = '') => {
  const r = request(app).get(`/api/admin/orders${query}`);
  return u ? r.set('Authorization', bearer(u)) : r;
};

/** Um pedido por motivo, mais os que não precisam de atenção. */
async function seed() {
  const lojaParada = await order({ status: 'pago', createdAt: ago(13), paidAt: ago(12) });
  const decidindo = await order({
    status: 'aguardando_motoboy', acceptedAt: ago(30), awaitingCustomerPoolDecision: true,
    delivery: { status: 'pending', createdAt: ago(25) },
  });
  const semMotoboy = await order({ status: 'aguardando_motoboy', acceptedAt: ago(20), delivery: { status: 'pending', createdAt: ago(16) } });
  const retirada = await order({
    status: 'aguardando_motoboy', acceptedAt: ago(40),
    delivery: { status: 'assigned', motoboyId: motoboy.userId, createdAt: ago(35), assignedAt: ago(21), pin: PIN_ENTREGA, pinRetirada: PIN_RETIRADA },
  });
  const atrasado = await order({
    status: 'aguardando_motoboy', acceptedAt: ago(90),
    delivery: { status: 'picked', motoboyId: motoboy.userId, createdAt: ago(80), assignedAt: ago(70), pickedAt: ago(46) },
  });
  const estorno = await order({ status: 'cancelado', cancelledAt: ago(5) });
  await prisma.cancellation.create({
    data: { orderId: estorno.orderId, cancelledBy: 'store', reason: 'Sem estoque', reasonCode: 'not_available', refundAmount: 30, refundStatus: 'pending' },
  });
  const normal = await order({ status: 'aguardando_motoboy', acceptedAt: ago(3), createdAt: ago(4), delivery: { status: 'pending', createdAt: ago(2) } });
  const pix = await order({ status: 'criado', paymentStatus: 'pending', paymentMethod: 'pix', paidAt: null, createdAt: ago(1) });
  const canceladoOntem = await order({ status: 'cancelado', cancelledAt: new Date(saoPauloDayRange(NOW).start.getTime() - 60_000) });
  return { lojaParada, decidindo, semMotoboy, retirada, atrasado, estorno, normal, pix, canceladoOntem };
}

describe('listAdminOrders', () => {
  it('filtro atenção: cada motivo na linha, na ordem R1, sem paginação', async () => {
    const s = await seed();
    const r = await listAdminOrders({ filter: 'atencao', storeId }, NOW);
    expect(r.nextCursor).toBeNull();
    expect(r.items.map((i) => [i.id, i.attention])).toEqual([
      [s.estorno.orderId, 'estorno_pendente'],
      [s.lojaParada.orderId, 'loja_parada'],
      [s.decidindo.orderId, 'cliente_decidindo'],
      [s.semMotoboy.orderId, 'sem_motoboy'],
      [s.retirada.orderId, 'retirada_demorada'],
      [s.atrasado.orderId, 'atrasado'],
    ]);
  });

  it('com filtro de loja, meta.attention conta só a loja filtrada', async () => {
    await seed();
    const outraLoja = await createOpsStore(DOMAIN, { name: 'Outra Loja' });
    await createOpsOrder({ customerId: cliente.userId, storeId: outraLoja, status: 'pago', createdAt: ago(13), paidAt: ago(12) });
    expect((await listAdminOrders({ filter: 'todos', storeId }, NOW)).meta.attention).toBe(6);
    expect((await listAdminOrders({ filter: 'atencao', storeId }, NOW)).meta.attention).toBe(6);
    expect((await listAdminOrders({ filter: 'todos', storeId: outraLoja }, NOW)).meta.attention).toBe(1);
    expect((await listAdminOrders({ filter: 'todos' }, NOW)).meta.attention).toBeGreaterThanOrEqual(7);
  });

  it('filtros: todos, aguardando Pix, na loja, em entrega e cancelados hoje', async () => {
    const s = await seed();
    const list = async (filter: any) => ids((await listAdminOrders({ filter, storeId }, NOW)).items);
    expect(await list('todos')).toEqual(ids([
      { id: s.lojaParada.orderId }, { id: s.decidindo.orderId }, { id: s.semMotoboy.orderId }, { id: s.retirada.orderId },
      { id: s.atrasado.orderId }, { id: s.normal.orderId }, { id: s.pix.orderId },
    ]));
    expect(await list('aguardando_pix')).toEqual([s.pix.orderId]);
    expect(await list('na_loja')).toEqual(ids([
      { id: s.lojaParada.orderId }, { id: s.decidindo.orderId }, { id: s.semMotoboy.orderId }, { id: s.retirada.orderId }, { id: s.normal.orderId },
    ]));
    expect(await list('em_entrega')).toEqual([s.atrasado.orderId]);
    expect(await list('cancelados_hoje')).toEqual([s.estorno.orderId]);
  });

  it('dentro da página: quem precisa de atenção primeiro (R1), depois o mais antigo', async () => {
    await seed();
    const r = await listAdminOrders({ filter: 'todos', storeId }, NOW);
    expect(r.items.map((i) => i.attention)).toEqual([
      'loja_parada', 'cliente_decidindo', 'sem_motoboy', 'retirada_demorada', 'atrasado', null, null,
    ]);
    const tail = r.items.slice(5);
    expect(tail[0].createdAt <= tail[1].createdAt).toBe(true);
  });

  it('linha no formato combinado, com motoboy e etapa, sem PIN, CPF nem e-mail', async () => {
    const s = await seed();
    const r = await listAdminOrders({ filter: 'todos', storeId }, NOW);
    const row = r.items.find((i) => i.id === s.retirada.orderId)!;
    expect(Object.keys(row).sort()).toEqual([
      'attention', 'createdAt', 'deliveryStatus', 'id', 'motoboy', 'shortId', 'stageSince', 'status', 'store', 'total',
    ]);
    const delivery = await prisma.delivery.findUnique({ where: { id: s.retirada.deliveryId! } });
    expect(row).toMatchObject({
      shortId: s.retirada.orderId.slice(-6),
      status: 'aguardando_motoboy',
      deliveryStatus: 'assigned',
      store: { id: storeId, name: 'Loja Lista' },
      motoboy: { id: motoboy.userId, name: 'User motoboy' },
      stageSince: delivery!.assignedAt!.toISOString(),
      total: 30,
      attention: 'retirada_demorada',
    });
    const email = (await prisma.user.findUnique({ where: { id: cliente.userId } }))!.email;
    const text = JSON.stringify(r);
    expect(text).not.toContain(PIN_ENTREGA);
    expect(text).not.toContain(PIN_RETIRADA);
    expect(text).not.toContain(CPF);
    expect(text).not.toContain(email);
    expect(text).not.toMatch(/"pin|"cpf"|"email"/);
  });

  it('cursor: 50 por página, sem repetir nem perder', async () => {
    const cursorStore = await createOpsStore(DOMAIN, { name: 'Loja Cursor' });
    const base = Date.now() - 3 * 60 * 60_000;
    await prisma.order.createMany({
      data: Array.from({ length: 52 }, (_, i) => ({
        customerId: cliente.userId, storeId: cursorStore, totalValue: 10, deliveryFee: 0,
        status: 'aguardando_motoboy' as const, paymentStatus: 'paid' as const,
        paidAt: new Date(base), acceptedAt: new Date(base), createdAt: new Date(base + i * 1000),
      })),
    });
    const p1 = await listAdminOrders({ filter: 'todos', storeId: cursorStore }, NOW);
    expect(p1.items).toHaveLength(50);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await listAdminOrders({ filter: 'todos', storeId: cursorStore, cursor: p1.nextCursor! }, NOW);
    expect(p2.items).toHaveLength(2);
    expect(p2.nextCursor).toBeNull();
    expect(new Set([...p1.items, ...p2.items].map((i) => i.id)).size).toBe(52);
  });

  it('atenção: varre do mais antigo para o mais novo e avisa quando bate o teto', async () => {
    // Mais antigo que qualquer pedido do banco: com teto 1, é o único varrido.
    const antigo = await order({ status: 'pago', createdAt: new Date('1999-01-01T12:00:00.000Z') });
    await seed();
    const cortado = await listAdminOrders({ filter: 'atencao', storeId }, NOW, { attentionScanMax: 1 });
    expect(cortado.items.map((i) => [i.id, i.attention])).toEqual([[antigo.orderId, 'loja_parada']]);
    expect(cortado.meta.attentionTruncated).toBe(true);
    expect(cortado.meta.attention).toBe(1);

    const inteiro = await listAdminOrders({ filter: 'atencao', storeId }, NOW, { attentionScanMax: 100_000 });
    expect(inteiro.meta.attentionTruncated).toBe(false);
    expect(inteiro.items).toHaveLength(7);
  });

  it('filtro de loja: pedidos de outra loja não aparecem', async () => {
    const outra = await createOpsStore(DOMAIN, { name: 'Outra Loja' });
    const daOutra = await createOpsOrder({ customerId: cliente.userId, storeId: outra, status: 'aguardando_motoboy', acceptedAt: ago(1) });
    const daMinha = await order({ status: 'aguardando_motoboy', acceptedAt: ago(1) });
    const r = await listAdminOrders({ filter: 'todos', storeId }, NOW);
    expect(r.items.map((i) => i.id)).toContain(daMinha.orderId);
    expect(r.items.map((i) => i.id)).not.toContain(daOutra.orderId);
    const rOutra = await listAdminOrders({ filter: 'todos', storeId: outra }, NOW);
    expect(rOutra.items.map((i) => i.id)).toEqual([daOutra.orderId]);
  });

  it('meta: em andamento, pagos, aguardando Pix, atenção, limites e entregues hoje', async () => {
    const before = (await listAdminOrders({ filter: 'todos', storeId }, NOW)).meta;
    await seed();
    await order({
      status: 'entregue', acceptedAt: ago(60),
      delivery: { status: 'delivered', motoboyId: motoboy.userId, createdAt: ago(50), assignedAt: ago(45), pickedAt: ago(40), deliveredAt: ago(10) },
    });
    const after = (await listAdminOrders({ filter: 'todos', storeId }, NOW)).meta;
    expect(after.active - before.active).toBe(7);
    expect(after.activePaid - before.activePaid).toBe(6);
    expect(after.awaitingPix - before.awaitingPix).toBe(1);
    expect(after.attention - before.attention).toBe(6);
    expect(after.deliveredToday - before.deliveredToday).toBe(1);
    expect(after.acceptLimitMin).toBe(10);
    expect(after.poolTimeoutMin).toBe(15);
    expect(Object.keys(after).sort()).toEqual([
      'acceptAvgMin', 'acceptLimitMin', 'active', 'activePaid', 'attention', 'attentionTruncated', 'awaitingPix',
      'deliveredToday', 'findMotoboyAvgMin', 'poolTimeoutMin',
    ]);
  });
});

describe('GET /api/admin/orders', () => {
  it('sem filtro vale "atencao"; filtro ou cursor inválido → 400 com código', async () => {
    const ok = await get(ceo, `?storeId=${storeId}`);
    expect(ok.status).toBe(200);
    expect(Object.keys(ok.body).sort()).toEqual(['items', 'meta', 'nextCursor']);
    expect(ok.body.nextCursor).toBeNull();

    const badFilter = await get(ceo, '?filtro=tudo');
    expect(badFilter.status).toBe(400);
    expect(badFilter.body).toEqual({ error: 'Filtro inválido', code: 'INVALID_FILTER' });

    const badCursor = await get(ceo, '?filtro=todos&cursor=abc');
    expect(badCursor.status).toBe(400);
    expect(badCursor.body.code).toBe('INVALID_CURSOR');
  });

  it('sem login → 401; sem operation:view → 403; com operation:view concedida a um gerente → 200', async () => {
    expect((await get(undefined)).status).toBe(401);
    const semPermissao = await createTestUser('gerente_geral', DOMAIN);
    expect((await get(semPermissao)).status).toBe(403);
    const marketing = await createTestUser('marketing', DOMAIN);
    const restore = await grantRolePermissions('marketing', ['operation:view']);
    try {
      expect((await get(marketing, '?filtro=todos')).status).toBe(200);
    } finally {
      await restore();
    }
  });
});
