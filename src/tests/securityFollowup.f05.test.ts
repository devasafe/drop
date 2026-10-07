/**
 * Regressão (riscos remanescentes 2026-10-07) — f05: o socket acompanha decisões do admin.
 *  - Motoboy aprovado no KYC só entrava na sala `motoboys` depois de reconectar (perdia
 *    corridas sem saber por quê).
 *  - Conta bloqueada recebia `auth:force_logout`, mas o socket continuava conectado e
 *    nas salas — um cliente que ignorasse o evento seguia recebendo tudo.
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

const DOMAIN = '@sf05.test';

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

afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
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

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

describe('f05 — socket segue o KYC e o bloqueio', () => {
  it('motoboy aprovado entra na sala motoboys sem reconectar', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const mb = await createTestUser('motoboy', DOMAIN);
    await prisma.user.update({
      where: { id: mb.userId },
      data: {
        verification: {
          email: { status: 'verified' }, document: { status: 'approved' }, facial: { status: 'approved' },
          courier: { status: 'pending', cnhNumber: '0', plate: 'ABC1D23' },
        },
      },
    });
    const c = await connect(mb);
    await settle();
    const antes = receives(c, 'delivery:available', 400);
    ioServer.to('motoboys').emit('delivery:available', { x: 1 });
    expect(await antes).toBe(false);

    const res = await request(app).post(`/api/verification/admin/motoboy/${mb.userId}/approve`).set('Authorization', bearer(ceo));
    expect(res.status).toBe(200);
    await settle();

    const depois = receives(c, 'delivery:available');
    ioServer.to('motoboys').emit('delivery:available', { x: 2 });
    expect(await depois).toBe(true);
  });

  it('conta bloqueada tem o socket desconectado', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const u = await createTestUser('cliente', DOMAIN);
    const c = await connect(u);
    const caiu = new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 3000);
      c.once('disconnect', () => { clearTimeout(t); resolve(true); });
    });
    const res = await request(app).put(`/api/admin/users/${u.userId}/status`).set('Authorization', bearer(ceo)).send({ status: 'blocked', reason: 'teste' });
    expect(res.status).toBe(200);
    expect(await caiu).toBe(true);
  });
});
