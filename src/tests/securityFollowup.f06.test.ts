/**
 * Regressão (riscos remanescentes 2026-10-07) — f06: chat.
 *  - O frontend emite `chat:join` ao abrir a conversa, mas o servidor não tratava o
 *    evento: ninguém entrava em `conversation:<id>` e "digitando"/"lido" nunca chegavam.
 *    Agora `chat:join` entra na sala só se o usuário participa da conversa.
 *  - markAsRead marcava mensagens como lidas e zerava contador sem checar se quem
 *    pedia participava da conversa.
 *  - O frontend chama POST /chat/messages/mark-as-read, rota que não existia.
 */
import http from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { initSocket } from '../services/notifier';

const DOMAIN = '@sf06.test';

let server: http.Server;
let url: string;
let ioServer: ReturnType<typeof initSocket>;
const clients: ClientSocket[] = [];
const convIds: string[] = [];

beforeAll(async () => {
  server = http.createServer(app);
  ioServer = initSocket(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await prisma.conversation.deleteMany({ where: { id: { in: convIds.splice(0) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

afterAll(async () => {
  await new Promise<void>((resolve) => ioServer.close(() => resolve()));
});

const connect = (u: TestUser) =>
  new Promise<ClientSocket>((resolve, reject) => {
    const c = ioClient(url, { auth: { token: u.token }, transports: ['websocket'], forceNew: true, reconnection: false });
    clients.push(c);
    c.on('connect', () => resolve(c));
    c.on('connect_error', reject);
  });

const receives = (c: ClientSocket, event: string, ms = 800) =>
  new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), ms);
    c.once(event, () => { clearTimeout(t); resolve(true); });
  });

const settle = () => new Promise((r) => setTimeout(r, 300));

async function conversa() {
  const loja = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const intruso = await createTestUser('cliente', DOMAIN);
  const conv = await prisma.conversation.create({
    data: {
      type: 'loja_cliente',
      participant1: { userId: loja.userId, role: 'lojista', name: 'Loja' },
      participant2: { userId: cliente.userId, role: 'cliente', name: 'Cliente' },
      unreadCount: [0, 1],
    },
  });
  convIds.push(conv.id);
  const msg = await prisma.message.create({
    data: { conversationId: conv.id, senderId: loja.userId, senderRole: 'lojista', senderName: 'Loja', text: 'oi' },
  });
  return { loja, cliente, intruso, conv, msg };
}

describe('f06 — chat', () => {
  it('participante recebe "digitando" após chat:join; intruso não', async () => {
    const { loja, cliente, intruso, conv } = await conversa();
    const cLoja = await connect(loja);
    const cCliente = await connect(cliente);
    const cIntruso = await connect(intruso);
    cCliente.emit('chat:join', { conversationId: conv.id });
    cIntruso.emit('chat:join', { conversationId: conv.id });
    await settle();

    const clienteViu = receives(cCliente, 'chat:user_typing');
    const intrusoViu = receives(cIntruso, 'chat:user_typing');
    cLoja.emit('chat:typing', { conversationId: conv.id, isTyping: true });
    expect(await clienteViu).toBe(true);
    expect(await intrusoViu).toBe(false);
  });

  it('quem não participa não marca mensagens como lidas', async () => {
    const { intruso, conv, msg } = await conversa();
    const res = await request(app)
      .put(`/api/chat/conversations/${conv.id}/mark-as-read`)
      .set('Authorization', bearer(intruso))
      .send({ conversationId: conv.id, messageIds: [msg.id] });
    expect(res.status).toBe(403);
    const m = await prisma.message.findUnique({ where: { id: msg.id } });
    expect(m?.status).toBe('sent');
    const c = await prisma.conversation.findUnique({ where: { id: conv.id } });
    expect(c?.unreadCount).toEqual([0, 1]);
  });

  it('participante marca como lida pela rota que o frontend usa', async () => {
    const { cliente, conv, msg } = await conversa();
    const res = await request(app)
      .post('/api/chat/messages/mark-as-read')
      .set('Authorization', bearer(cliente))
      .send({ conversationId: conv.id, messageIds: [msg.id] });
    expect(res.status).toBe(200);
    const m = await prisma.message.findUnique({ where: { id: msg.id } });
    expect(m?.status).toBe('read');
  });
});
