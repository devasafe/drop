// src/tests/opreal.suporteChamado.test.ts
/**
 * Operação real · chat de suporte (DS v2, frames "Conversa com o suporte" e "· resolvida").
 * - O chamado guarda o pedido (orderId), só de quem tem relação com ele, e a lista traz o resumo.
 * - O atendente que assumiu recebe as mensagens ao vivo, mesmo sem ser participante da conversa.
 * - Quem abriu fica sabendo quando alguém assume.
 */
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import notifier from '../services/notifier';
import { emitToRoom } from '../utils/socketEmitter';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@suportechamado.test';
const emit = emitToRoom as jest.Mock;
const ioEmits: Array<{ room: string; event: string; data: any }> = [];
const fakeIo = { to: (room: string) => ({ emit: (event: string, data: any) => { ioEmits.push({ room, event, data }); } }) };
let ticketIds: string[] = [];

beforeEach(() => {
  emit.mockReset();
  ioEmits.length = 0;
  jest.spyOn(notifier, 'io', 'get').mockReturnValue(fakeIo as any);
});
afterEach(async () => {
  if (ticketIds.length) await prisma.supportTicket.deleteMany({ where: { id: { in: ticketIds } } });
  ticketIds = [];
  await cleanupUsersByEmailDomain(DOMAIN);
});
afterAll(async () => { jest.restoreAllMocks(); await prisma.$disconnect(); });

async function pedidoDe(clienteId: string) {
  const dono = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Eletro Center', isOpen: true } });
  const order = await prisma.order.create({
    data: { customerId: clienteId, storeId: store.id, totalValue: 244, deliveryFee: 10, paymentMethod: 'pix', paymentStatus: 'paid', status: 'entregue' } as any,
  });
  return { dono, store, order };
}

async function abrir(who: any, body: any) {
  const r = await request(app).post('/api/support/tickets').set('Authorization', bearer(who)).send(body);
  if (r.body?.ticket?.id) ticketIds.push(r.body.ticket.id);
  return r;
}

describe('chamado com o pedido', () => {
  it('guarda o orderId e a lista do cliente traz o resumo do pedido', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    const { order } = await pedidoDe(cliente.userId);

    const r = await abrir(cliente, { subject: 'Faltou o cabo', orderId: order.id });
    expect(r.status).toBe(201);
    expect(r.body.ticket.orderId).toBe(order.id);

    const list = await request(app).get('/api/support/tickets').set('Authorization', bearer(cliente));
    const t = list.body.find((x: any) => x._id === r.body.ticket.id);
    expect(t.order).toMatchObject({ _id: order.id, storeName: 'Eletro Center', status: 'entregue', totalValue: 244 });
  });

  it('pedido de outra pessoa: 403 e nada é criado', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    const outro = await createTestUser('cliente', DOMAIN);
    const { order } = await pedidoDe(outro.userId);
    const antes = await prisma.supportTicket.count();

    const r = await abrir(cliente, { subject: 'Pedido alheio', orderId: order.id });
    expect(r.status).toBe(403);
    expect(await prisma.supportTicket.count()).toBe(antes);
  });

  it('a loja do pedido também pode abrir chamado sobre ele', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    const { dono, order } = await pedidoDe(cliente.userId);
    const r = await abrir(dono, { subject: 'Cliente diz que faltou item', orderId: order.id });
    expect(r.status).toBe(201);
    expect(r.body.ticket.orderId).toBe(order.id);
  });

  it('pedido que não existe: 404', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    const r = await abrir(cliente, { subject: 'x', orderId: 'nao-existe' });
    expect(r.status).toBe(404);
  });

  it('sem pedido continua funcionando', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    const r = await abrir(cliente, { subject: 'Ajuda pelo app' });
    expect(r.status).toBe(201);
    expect(r.body.ticket.orderId).toBeNull();
  });
});

describe('ao vivo para quem atende', () => {
  it('o atendente que assumiu recebe a mensagem do cliente pelo socket', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    const ceo = await createTestUser('ceo', DOMAIN);
    const r = await abrir(cliente, { subject: 'Preciso de ajuda' });
    const { ticket, conversationId } = r.body;

    const a = await request(app).put(`/api/support/tickets/${ticket.id}/assign`).set('Authorization', bearer(ceo));
    expect(a.status).toBe(200);

    ioEmits.length = 0;
    const m = await request(app).post(`/api/chat/conversations/${conversationId}/messages`).set('Authorization', bearer(cliente)).send({ text: 'Chegou só o fone' });
    expect(m.status).toBe(201);

    const toCeo = ioEmits.filter((e) => e.room === `user:${ceo.userId}` && e.event === 'chat:new_message');
    expect(toCeo).toHaveLength(1);
    expect(toCeo[0].data).toMatchObject({ conversationId, text: 'Chegou só o fone' });
  });

  it('assumir avisa quem abriu (status e nome de quem atende)', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    const ceo = await createTestUser('ceo', DOMAIN);
    const r = await abrir(cliente, { subject: 'Assumir avisa' });
    emit.mockReset();

    await request(app).put(`/api/support/tickets/${r.body.ticket.id}/assign`).set('Authorization', bearer(ceo));

    const calls = emit.mock.calls.filter((c) => c[0] === `user:${cliente.userId}` && c[1] === 'support:ticket_updated');
    expect(calls).toHaveLength(1);
    expect(calls[0][2]).toMatchObject({ ticketId: r.body.ticket.id, conversationId: r.body.conversationId, status: 'em_atendimento', attendantName: 'User ceo' });
  });
});
