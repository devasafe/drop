/**
 * Regressão (riscos remanescentes 2026-10-07) — f03: origem do socket e localização.
 *  - O Socket.io aceitava qualquer *.vercel.app e qualquer http://localhost (a API HTTP
 *    não). Como o socket autentica pelo cookie, uma página nessas origens abria a
 *    conexão com a sessão da vítima. Agora vale a mesma lista do HTTP, inclusive para
 *    conexão direta por WebSocket (allowRequest).
 *  - `presence:location` aceitava qualquer valor (lat 999, NaN, Infinity) e sem limite
 *    de frequência; agora só coordenada válida, no máximo uma a cada 10 s.
 */
import http from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import app from '../app';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, TestUser } from './helpers/authUser';
import { initSocket } from '../services/notifier';
import { onlineTracker } from '../services/onlineTracker';
import { isOriginAllowed } from '../config/corsOrigins';

const DOMAIN = '@sf03.test';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

describe('f03 — isOriginAllowed', () => {
  it('só a lista do CORS_ORIGIN (sem vercel.app/localhost soltos)', () => {
    expect(isOriginAllowed('http://localhost:3000')).toBe(true); // está no CORS_ORIGIN de teste
    expect(isOriginAllowed('https://qualquer-coisa.vercel.app')).toBe(false);
    expect(isOriginAllowed('http://localhost:9999')).toBe(false);
    expect(isOriginAllowed('https://evil.example.com')).toBe(false);
  });
});

describe('f03 — integração Socket.io', () => {
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

  const connect = (u: TestUser, origin?: string) =>
    new Promise<ClientSocket>((resolve, reject) => {
      const c = ioClient(url, {
        auth: { token: u.token }, transports: ['websocket'], forceNew: true,
        ...(origin ? { extraHeaders: { Origin: origin } } : {}),
      });
      clients.push(c);
      c.on('connect', () => resolve(c));
      c.on('connect_error', reject);
    });

  const settle = () => new Promise((r) => setTimeout(r, 300));

  it.each(['https://phishing.vercel.app', 'http://localhost:6666'])('origem %s não conecta', async (origin) => {
    const u = await createTestUser('cliente', DOMAIN);
    await expect(connect(u, origin)).rejects.toBeTruthy();
  });

  it('origem permitida conecta', async () => {
    const u = await createTestUser('cliente', DOMAIN);
    await expect(connect(u, 'http://localhost:3000')).resolves.toBeTruthy();
  });

  it('presence:location ignora coordenada inválida e excesso de frequência', async () => {
    const u = await createTestUser('motoboy', DOMAIN);
    const c = await connect(u);
    await settle();

    for (const bad of [{ latitude: 999, longitude: 10 }, { latitude: 'x', longitude: 1 }, { latitude: -23.5, longitude: 500 }]) {
      c.emit('presence:location', bad);
    }
    await settle();
    expect(onlineTracker.get(u.userId)?.lat).toBeUndefined();

    c.emit('presence:location', { latitude: -23.55, longitude: -46.63 });
    await settle();
    expect(onlineTracker.get(u.userId)?.lat).toBe(-23.55);

    c.emit('presence:location', { latitude: -22.9, longitude: -43.2 }); // logo em seguida: ignorado
    await settle();
    expect(onlineTracker.get(u.userId)?.lat).toBe(-23.55);
  });
});
