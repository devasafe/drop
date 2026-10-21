/**
 * D3b-2a · P1.6 — último acesso: o authenticate grava User.lastSeenAt no máximo a cada 5 min,
 * sem segurar a resposta; erro só vai para o log; conta recusada não grava.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { LAST_SEEN_EVERY_MS, touchLastSeen } from '../middleware/auth';

const DOMAIN = '@d3b2ap16.test';

afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupUsersByEmailDomain(DOMAIN);
});

const me = (u: TestUser) => request(app).get('/api/role-permissions/me').set('Authorization', bearer(u));
const lastSeenOf = async (id: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id }, select: { lastSeenAt: true } })).lastSeenAt;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A gravação não segura a resposta: espera ela chegar ao banco (até 2 s). */
async function waitForLastSeen(id: string, ok: (v: Date | null) => boolean): Promise<Date | null> {
  for (let i = 0; i < 40; i++) {
    const v = await lastSeenOf(id);
    if (ok(v)) return v;
    await pause(50);
  }
  return lastSeenOf(id);
}

describe('authenticate grava o último acesso', () => {
  it('a janela é de 5 minutos', () => {
    expect(LAST_SEEN_EVERY_MS).toBe(5 * 60_000);
  });

  it('primeiro acesso autenticado grava lastSeenAt', async () => {
    const u = await createTestUser('cliente', DOMAIN);
    expect(await lastSeenOf(u.userId)).toBeNull();
    const before = Date.now();
    expect((await me(u)).status).toBe(200);
    const seen = await waitForLastSeen(u.userId, (v) => v !== null);
    expect(seen).not.toBeNull();
    expect(seen!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(seen!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('acesso de 1 min atrás: não grava de novo (nem tenta)', async () => {
    const u = await createTestUser('cliente', DOMAIN);
    const recent = new Date(Date.now() - 60_000);
    await prisma.user.update({ where: { id: u.userId }, data: { lastSeenAt: recent } });
    const spy = jest.spyOn(prisma.user, 'updateMany');
    expect((await me(u)).status).toBe(200);
    await pause(200);
    expect(spy).not.toHaveBeenCalled();
    expect((await lastSeenOf(u.userId))!.getTime()).toBe(recent.getTime());
  });

  it('acesso de 6 min atrás: grava o novo', async () => {
    const u = await createTestUser('cliente', DOMAIN);
    const old = new Date(Date.now() - 6 * 60_000);
    await prisma.user.update({ where: { id: u.userId }, data: { lastSeenAt: old } });
    expect((await me(u)).status).toBe(200);
    const seen = await waitForLastSeen(u.userId, (v) => !!v && v.getTime() > old.getTime());
    expect(seen!.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('a condição também vai no WHERE: valor lido velho não sobrescreve um acesso recente', async () => {
    const u = await createTestUser('cliente', DOMAIN);
    const recent = new Date(Date.now() - 60_000);
    await prisma.user.update({ where: { id: u.userId }, data: { lastSeenAt: recent } });
    touchLastSeen(u.userId, null);
    await pause(300);
    expect((await lastSeenOf(u.userId))!.getTime()).toBe(recent.getTime());
  });

  it('não segura a resposta: com a escrita parada, a requisição responde', async () => {
    const u = await createTestUser('cliente', DOMAIN);
    const spy = jest.spyOn(prisma.user, 'updateMany').mockImplementation((() => new Promise(() => undefined)) as any);
    const res = await me(u);
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('erro na escrita só vai para o log; a requisição responde normalmente', async () => {
    const u = await createTestUser('cliente', DOMAIN);
    jest.spyOn(prisma.user, 'updateMany').mockRejectedValueOnce(new Error('banco fora'));
    const log = jest.spyOn(logger, 'error').mockImplementation(() => undefined as any);
    expect((await me(u)).status).toBe(200);
    for (let i = 0; i < 20 && log.mock.calls.length === 0; i++) await pause(25);
    expect(log).toHaveBeenCalledWith('[authenticate] falha ao gravar o último acesso', expect.any(Error), { userId: u.userId });
  });

  it('conta bloqueada (403) não grava', async () => {
    const u = await createTestUser('cliente', DOMAIN);
    await prisma.user.update({ where: { id: u.userId }, data: { status: 'blocked', blockReason: 'teste p1.6' } });
    expect((await me(u)).status).toBe(403);
    await pause(200);
    expect(await lastSeenOf(u.userId)).toBeNull();
  });
});
