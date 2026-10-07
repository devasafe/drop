/**
 * Regressão (auditoria de segurança 2026-10-07) — item 7: salas do Socket.io decididas
 * pelo servidor. O `join` pedido pelo cliente só é aceito se o servidor autorizar:
 *   user:<id>      → só o próprio usuário
 *   store:<id>     → só o dono da loja
 *   motoboys       → só motoboy com KYC aprovado (quando KYC_ENFORCED)
 *   admin[:papel]  → só papéis administrativos (e o próprio papel)
 *   qualquer outra → recusada
 */
import http from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, TestUser } from './helpers/authUser';
import { initSocket } from '../services/notifier';
import { authorizeRoom } from '../services/socketRooms';

const DOMAIN = '@sec07.test';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function lojaDe(owner: TestUser) {
  return prisma.store.create({ data: { ownerId: owner.userId, name: 'Loja sec07', isOpen: true } });
}

const asSocketUser = (u: TestUser) => ({ id: u.userId, role: u.role });

describe('Item 7 — authorizeRoom', () => {
  it('user:<id> só para o próprio usuário', async () => {
    const a = await createTestUser('cliente', DOMAIN);
    const b = await createTestUser('cliente', DOMAIN);
    expect(await authorizeRoom(asSocketUser(a), `user:${a.userId}`)).toBe(true);
    expect(await authorizeRoom(asSocketUser(a), `user:${b.userId}`)).toBe(false);
  });

  it('store:<id> só para o dono', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const outro = await createTestUser('lojista', DOMAIN);
    const loja = await lojaDe(dono);
    expect(await authorizeRoom(asSocketUser(dono), `store:${loja.id}`)).toBe(true);
    expect(await authorizeRoom(asSocketUser(outro), `store:${loja.id}`)).toBe(false);
    expect(await authorizeRoom(asSocketUser(dono), 'store:inexistente')).toBe(false);
  });

  it('motoboys só para motoboy verificado', async () => {
    const ok = await createTestUser('motoboy', DOMAIN);
    const pendente = await createTestUser('motoboy', DOMAIN, { verified: false });
    const cliente = await createTestUser('cliente', DOMAIN);
    expect(await authorizeRoom(asSocketUser(ok), 'motoboys')).toBe(true);
    expect(await authorizeRoom(asSocketUser(pendente), 'motoboys')).toBe(false);
    expect(await authorizeRoom(asSocketUser(cliente), 'motoboys')).toBe(false);
  });

  it('admin só para papéis administrativos, e admin:<papel> só o próprio', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const cliente = await createTestUser('cliente', DOMAIN);
    expect(await authorizeRoom(asSocketUser(ceo), 'admin')).toBe(true);
    expect(await authorizeRoom(asSocketUser(cliente), 'admin')).toBe(false);
    expect(await authorizeRoom(asSocketUser(gerente), 'admin:gerente_geral')).toBe(true);
    expect(await authorizeRoom(asSocketUser(gerente), 'admin:ceo')).toBe(false);
  });

  it('qualquer outra sala é recusada', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    for (const room of ['conversation:abc', 'chat:abc', 'motoboy:abc', '', 'qualquer']) {
      expect(await authorizeRoom(asSocketUser(ceo), room)).toBe(false);
    }
  });
});

describe('Item 7 — integração Socket.io', () => {
  let server: http.Server;
  let url: string;
  let ioServer: ReturnType<typeof initSocket>;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    server = http.createServer(app);
    ioServer = initSocket(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    clients.splice(0).forEach((c) => c.close());
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => ioServer.close(() => resolve()));
  });

  const connect = (u: TestUser) =>
    new Promise<ClientSocket>((resolve, reject) => {
      const c = ioClient(url, { auth: { token: u.token }, transports: ['websocket'], forceNew: true });
      clients.push(c);
      c.on('connect', () => resolve(c));
      c.on('connect_error', reject);
    });

  const receives = (c: ClientSocket, event: string, ms = 600) =>
    new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), ms);
      c.once(event, () => { clearTimeout(t); resolve(true); });
    });

  const settle = () => new Promise((r) => setTimeout(r, 300));

  it('cliente pede join em admin e na loja de outro e não recebe nada', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const loja = await lojaDe(dono);
    const intruso = await createTestUser('cliente', DOMAIN);
    const c = await connect(intruso);

    c.emit('join', { room: 'admin' });
    c.emit('join', { room: `store:${loja.id}`, storeId: loja.id });
    c.emit('join', { room: `user:${dono.userId}` });
    await settle();

    const got = receives(c, 'vazou');
    ioServer.to('admin').emit('vazou', { pin: '12345' });
    ioServer.to(`store:${loja.id}`).emit('vazou', { pin: '12345' });
    ioServer.to(`user:${dono.userId}`).emit('vazou', { pin: '12345' });
    expect(await got).toBe(false);
  });

  it('dono da loja continua recebendo eventos da própria loja', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const loja = await lojaDe(dono);
    const c = await connect(dono);
    c.emit('join', { room: `store:${loja.id}`, storeId: loja.id });
    await settle();

    const got = receives(c, 'new_order');
    ioServer.to(`store:${loja.id}`).emit('new_order', { orderId: 'x' });
    expect(await got).toBe(true);
  });

  it('motoboy sem KYC aprovado não entra na sala motoboys', async () => {
    const pendente = await createTestUser('motoboy', DOMAIN, { verified: false });
    const c = await connect(pendente);
    c.emit('join', { room: 'motoboys' });
    await settle();

    const got = receives(c, 'delivery:available');
    ioServer.to('motoboys').emit('delivery:available', { deliveryId: 'x' });
    expect(await got).toBe(false);
  });

  it('usuário bloqueado não conecta', async () => {
    const u = await createTestUser('cliente', DOMAIN);
    await prisma.user.update({ where: { id: u.userId }, data: { status: 'blocked' } });
    await expect(connect(u)).rejects.toBeTruthy();
  });
});
