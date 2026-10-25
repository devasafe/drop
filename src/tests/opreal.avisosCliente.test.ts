/**
 * Avisos ao cliente em cada etapa do pedido (pendência da reunião de 23/10): sino + push em todas,
 * e-mail só nas etapas com dinheiro ou desfecho (pago, entregue, cancelado, estorno concluído).
 */
jest.mock('../services/pushService', () => {
  const actual = jest.requireActual('../services/pushService');
  return { __esModule: true, ...actual, sendPushToUser: jest.fn(async () => {}) };
});
jest.mock('../services/emailProvider', () => ({ __esModule: true, sendEmail: jest.fn(async () => {}) }));

import { prisma } from '../lib/prisma';
import { sendPushToUser } from '../services/pushService';
import { sendEmail } from '../services/emailProvider';
import { notifyCustomerOrder, CUSTOMER_LINKS, siteUrl } from '../services/customerNotify';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';

const DOMAIN = '@opreal-avisos.test';
const push = sendPushToUser as jest.Mock;
const email = sendEmail as jest.Mock;

async function wipe() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.orderItem.deleteMany({ where: { order: { customerId: { in: ids } } } });
  await prisma.order.deleteMany({ where: { customerId: { in: ids } } });
}

beforeEach(() => { push.mockClear(); email.mockReset(); email.mockResolvedValue(undefined); });
afterEach(async () => { await wipe(); await cleanupUsersByEmailDomain(DOMAIN); });
afterAll(async () => { await prisma.$disconnect(); });

async function setup(order: Record<string, unknown> = {}, storeName = 'Mercado Bom') {
  const cliente = await createTestUser('cliente', DOMAIN);
  const dono = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: storeName, isOpen: true } });
  const created = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, totalValue: 25.9, deliveryFee: 6, status: 'criado',
      paymentMethod: 'pix', paymentStatus: 'paid', ...order,
    } as any,
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: cliente.userId }, select: { email: true } });
  return { clienteId: cliente.userId, clienteEmail: user.email, orderId: created.id };
}

const rows = (userId: string) => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

describe('notifyCustomerOrder', () => {
  it('link do pedido do cliente', () => {
    expect(CUSTOMER_LINKS.order('abc')).toBe('/pedido/abc');
  });

  it('pagamento confirmado: sino, push e e-mail com loja e valor, link para o pedido', async () => {
    const { clienteId, clienteEmail, orderId } = await setup();
    await notifyCustomerOrder(orderId, 'paid');

    const [row] = await rows(clienteId);
    expect(row).toMatchObject({ title: 'Pagamento confirmado', type: 'order', link: `/pedido/${orderId}`, entityId: orderId, read: false });
    expect(row.message).toContain('Mercado Bom');
    expect(push).toHaveBeenCalledWith(clienteId, expect.objectContaining({ title: 'Pagamento confirmado', url: `/pedido/${orderId}` }));
    expect(email).toHaveBeenCalledTimes(1);
    const [to, subject, html] = email.mock.calls[0];
    expect(to).toBe(clienteEmail);
    expect(subject).toContain('Pagamento confirmado');
    expect(html).toContain('R$ 25,90');
    expect(html).toContain(`${siteUrl()}/pedido/${orderId}`);
  });

  it('mesma etapa repetida (webhook + conciliação) avisa uma vez só, inclusive o e-mail', async () => {
    const { clienteId, orderId } = await setup();
    await notifyCustomerOrder(orderId, 'paid');
    await notifyCustomerOrder(orderId, 'paid');
    expect(await rows(clienteId)).toHaveLength(1);
    expect(push).toHaveBeenCalledTimes(1);
    expect(email).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['accepted', 'Pedido aceito'],
    ['motoboy_assigned', 'Motoboy a caminho da loja'],
    ['picked', 'Saiu para entrega'],
    ['searching_motoboy', 'Procurando outro motoboy'],
    ['pool_timeout', 'Nenhum motoboy disponível'],
    ['return_decision', 'Escolha o que fazer com seu pedido'],
  ] as const)('%s: sino e push, sem e-mail', async (stage, title) => {
    const { clienteId, orderId } = await setup();
    await notifyCustomerOrder(orderId, stage);
    const [row] = await rows(clienteId);
    expect(row).toMatchObject({ title, link: `/pedido/${orderId}` });
    expect(push).toHaveBeenCalledTimes(1);
    expect(email).not.toHaveBeenCalled();
  });

  it('entregue: sino, push e e-mail', async () => {
    const { clienteId, orderId } = await setup({ status: 'entregue' });
    await notifyCustomerOrder(orderId, 'delivered');
    expect((await rows(clienteId))[0].title).toBe('Pedido entregue');
    expect(email).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Pedido entregue'), expect.any(String));
  });

  it('cancelado depois de pago: motivo e estorno no aviso e no e-mail', async () => {
    const { clienteId, orderId } = await setup({ status: 'cancelado' });
    await notifyCustomerOrder(orderId, 'cancelled', { reasonCode: 'not_available', refundAmount: 25.9 });
    const [row] = await rows(clienteId);
    expect(row.title).toBe('Pedido cancelado');
    expect(row.message).toContain('produto indisponível');
    expect(row.message).toContain('R$ 25,90');
    expect(email).toHaveBeenCalledTimes(1);
    expect(email.mock.calls[0][2]).toContain('R$ 25,90');
  });

  it('o texto livre da loja nunca vai para o cliente: só a frase fixa do código', async () => {
    const { clienteId, orderId } = await setup({ status: 'cancelado' });
    await notifyCustomerOrder(orderId, 'cancelled', { reasonCode: 'other', reason: 'pague no pix 11999999999 http://golpe.example' } as any);
    const [row] = await rows(clienteId);
    expect(row.message).not.toMatch(/golpe|11999999999|pix/i);
    expect(email.mock.calls[0][2]).not.toMatch(/golpe|11999999999/);
  });

  it('cancelado sem pagamento: não fala de devolução', async () => {
    const { clienteId, orderId } = await setup({ status: 'cancelado', paymentStatus: 'pending' });
    await notifyCustomerOrder(orderId, 'cancelled', { reasonCode: 'customer_request' });
    const [row] = await rows(clienteId);
    expect(row.message).not.toMatch(/devolver|R\$/i);
  });

  it('cancelado sem nada a devolver (valor 0): não fala de devolução', async () => {
    const { clienteId, orderId } = await setup({ status: 'cancelado' });
    await notifyCustomerOrder(orderId, 'cancelled', { reasonCode: 'other', refundAmount: 0 });
    expect((await rows(clienteId))[0].message).not.toMatch(/devolver/i);
  });

  it('cancelado pelo suporte: não cita loja nem motivo', async () => {
    const { clienteId, orderId } = await setup({ status: 'cancelado' }, 'Loja Culpada');
    await notifyCustomerOrder(orderId, 'cancelled', { byAdmin: true, reasonCode: 'store_rejected', refundAmount: 10 });
    const [row] = await rows(clienteId);
    expect(row.title).toBe('Pedido cancelado');
    expect(row.message).toBe(`O suporte do DROP cancelou o seu pedido #${orderId.slice(-6)}. Vamos devolver R$ 10,00.`);
    expect(email).toHaveBeenCalledTimes(1);
  });

  it('cancelado avisado por dois caminhos (recusa da loja + cancelamento) chega uma vez', async () => {
    const { clienteId, orderId } = await setup({ status: 'cancelado' });
    await notifyCustomerOrder(orderId, 'cancelled', { reasonCode: 'store_rejected' });
    await notifyCustomerOrder(orderId, 'cancelled', { reasonCode: 'store_rejected' });
    expect(await rows(clienteId)).toHaveLength(1);
    expect(email).toHaveBeenCalledTimes(1);
  });

  it('estorno concluído: valor no aviso e e-mail', async () => {
    const { clienteId, orderId } = await setup({ status: 'cancelado', paymentStatus: 'refunded' });
    await notifyCustomerOrder(orderId, 'refunded');
    const [row] = await rows(clienteId);
    expect(row.title).toBe('Estorno concluído');
    expect(row.message).toContain('R$ 25,90');
    expect(email).toHaveBeenCalledTimes(1);
  });

  it('Pix expirado: diz que nada foi cobrado, sem e-mail', async () => {
    const { clienteId, orderId } = await setup({ status: 'cancelado', paymentStatus: 'failed' });
    await notifyCustomerOrder(orderId, 'pix_expired');
    const [row] = await rows(clienteId);
    expect(row.title).toBe('Pagamento não identificado');
    expect(row.message).toMatch(/nenhum valor foi cobrado/i);
    expect(email).not.toHaveBeenCalled();
  });

  it('troca de motoboy pode acontecer mais de uma vez: cada uma avisa', async () => {
    const { clienteId, orderId } = await setup();
    await notifyCustomerOrder(orderId, 'motoboy_assigned');
    await notifyCustomerOrder(orderId, 'searching_motoboy');
    await notifyCustomerOrder(orderId, 'motoboy_assigned');
    await notifyCustomerOrder(orderId, 'searching_motoboy');
    expect(await rows(clienteId)).toHaveLength(4);
  });

  it('nome da loja vai escapado no e-mail', async () => {
    const { orderId } = await setup({}, '<b>Loja</b> & Cia');
    await notifyCustomerOrder(orderId, 'paid');
    const html = email.mock.calls[0][2] as string;
    expect(html).not.toContain('<b>Loja</b>');
    expect(html).toContain('&lt;b&gt;Loja&lt;/b&gt; &amp; Cia');
  });

  it('e-mail que falha não lança e não impede sino e push', async () => {
    email.mockRejectedValue(new Error('Brevo fora'));
    const { clienteId, orderId } = await setup();
    await expect(notifyCustomerOrder(orderId, 'paid')).resolves.toBeUndefined();
    expect(await rows(clienteId)).toHaveLength(1);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('pedido inexistente: não lança e não avisa ninguém', async () => {
    await expect(notifyCustomerOrder('nao-existe', 'paid')).resolves.toBeUndefined();
    expect(push).not.toHaveBeenCalled();
    expect(email).not.toHaveBeenCalled();
  });
});
