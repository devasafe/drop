/**
 * Papel de equipe vira acréscimo (16/10) — salas de admin do Socket.io.
 * A pessoa com papel de equipe continua cliente (papel ativo). As salas `admin` e
 * `admin:<papel>` seguem a mesma união das permissões: papel ativo + papéis de equipe
 * gravados no BANCO. Sem isso a equipe perde as notificações em tempo real do painel.
 */
import http from 'http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { TEST_JWT_SECRET } from './helpers/authUser';
import { initSocket } from '../services/notifier';
import { authorizeRoom } from '../services/socketRooms';

const DOMAIN = '@equipe-socket.test';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function createAccount(roles: string[], activeRole: string) {
  const user = await prisma.user.create({
    data: {
      name: 'Equipe',
      email: `u-${Date.now()}-${Math.random().toString(36).slice(2)}${DOMAIN}`,
      passwordHash: await bcrypt.hash('Senha123!', 4),
      role: activeRole as any,
      roles: roles as any,
      activeRole: activeRole as any,
    },
  });
  // Token só com o papel ativo: os papéis de equipe vêm do banco.
  const token = jwt.sign({ id: user.id, role: activeRole, activeRole }, TEST_JWT_SECRET, { expiresIn: '1h' });
  return { id: user.id, token };
}

describe('authorizeRoom — salas de admin pela união (papel ativo + papéis de equipe do banco)', () => {
  it('cliente+marketing com papel ativo cliente pode entrar em admin e admin:marketing, não em admin:ceo', async () => {
    const u = { id: 'x', role: 'cliente', roles: ['cliente', 'marketing'] };
    expect(await authorizeRoom(u, 'admin')).toBe(true);
    expect(await authorizeRoom(u, 'admin:marketing')).toBe(true);
    expect(await authorizeRoom(u, 'admin:ceo')).toBe(false);
    expect(await authorizeRoom(u, 'admin:gerente_geral')).toBe(false);
  });

  it('cliente puro não entra em sala de admin', async () => {
    const u = { id: 'x', role: 'cliente', roles: ['cliente'] };
    expect(await authorizeRoom(u, 'admin')).toBe(false);
    expect(await authorizeRoom(u, 'admin:marketing')).toBe(false);
  });

  it('ceo em roles não vale como acréscimo: CEO só pelo papel ativo', async () => {
    const u = { id: 'x', role: 'cliente', roles: ['cliente', 'ceo'] };
    expect(await authorizeRoom(u, 'admin')).toBe(false);
    expect(await authorizeRoom(u, 'admin:ceo')).toBe(false);
  });
});

describe('Socket.io — conexão entra nas salas de admin pela união', () => {
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
    await prisma.$disconnect();
  });

  const connect = (token: string) =>
    new Promise<ClientSocket>((resolve, reject) => {
      const c = ioClient(url, { auth: { token }, transports: ['websocket'], forceNew: true });
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

  it('cliente+marketing com papel ativo cliente recebe admin:notification e eventos de admin:marketing', async () => {
    const equipe = await createAccount(['cliente', 'marketing'], 'cliente');
    const c = await connect(equipe.token);
    await settle();

    const geral = receives(c, 'admin:notification');
    ioServer.to('admin').emit('admin:notification', { title: 'Nova verificação' });
    expect(await geral).toBe(true);

    const proprio = receives(c, 'so-marketing');
    ioServer.to('admin:marketing').emit('so-marketing', {});
    expect(await proprio).toBe(true);
  });

  it('cliente puro não recebe nada das salas de admin, nem pedindo join', async () => {
    const puro = await createAccount(['cliente'], 'cliente');
    const c = await connect(puro.token);
    c.emit('join', { room: 'admin' });
    c.emit('join', { room: 'admin:marketing' });
    await settle();

    const got = receives(c, 'admin:notification');
    ioServer.to('admin').emit('admin:notification', { title: 'x' });
    ioServer.to('admin:marketing').emit('admin:notification', { title: 'x' });
    expect(await got).toBe(false);
  });
});
