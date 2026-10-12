/**
 * D1 · P2.5 — o dono pausa a loja por 30/60/120 min ou "até amanhã" e tira a pausa.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@d1pause.test';
const ALL_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const spHHMM = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function lojaDe(dono: TestUser, extra: Record<string, unknown> = {}) {
  return prisma.store.create({ data: { ownerId: dono.userId, name: 'Pastelaria Pausa', isOpen: true, isVerified: true, ...extra } as any });
}

describe('PUT /stores/:id/pause', () => {
  it('60 min: grava e devolve pausedUntil = agora + 60 min', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await lojaDe(dono);
    const before = Date.now();
    const res = await request(app).put(`/api/stores/${store.id}/pause`).set('Authorization', bearer(dono)).send({ minutes: 60 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const until = new Date(res.body.data.pausedUntil).getTime();
    expect(until).toBeGreaterThanOrEqual(before + 60 * 60_000);
    expect(until).toBeLessThanOrEqual(Date.now() + 60 * 60_000);
    const saved = await prisma.store.findUnique({ where: { id: store.id } });
    expect((saved as any).pausedUntil.getTime()).toBe(until);
  });

  it('30 e 120 min valem; 45, 0 e texto não', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await lojaDe(dono);
    for (const minutes of [30, 120]) {
      const ok = await request(app).put(`/api/stores/${store.id}/pause`).set('Authorization', bearer(dono)).send({ minutes });
      expect(ok.status).toBe(200);
    }
    for (const minutes of [45, 0, '60']) {
      const bad = await request(app).put(`/api/stores/${store.id}/pause`).set('Authorization', bearer(dono)).send({ minutes });
      expect(bad.status).toBe(400);
    }
  });

  it('até amanhã, sem horário: amanhã às 08:00 em São Paulo', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await lojaDe(dono);
    const res = await request(app).put(`/api/stores/${store.id}/pause`).set('Authorization', bearer(dono)).send({ untilTomorrow: true });
    expect(res.status).toBe(200);
    const until = new Date(res.body.data.pausedUntil);
    expect(spHHMM(until)).toBe('08:00');
    expect(until.getTime()).toBeGreaterThan(Date.now());
    expect(until.getTime() - Date.now()).toBeLessThanOrEqual(33 * 60 * 60_000);
  });

  it('até amanhã, com horário: a abertura do próximo dia', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const hours = Object.fromEntries(ALL_DAYS.map((d) => [d, { open: '10:30', close: '22:00' }]));
    const store = await lojaDe(dono, { operatingHours: hours });
    const res = await request(app).put(`/api/stores/${store.id}/pause`).set('Authorization', bearer(dono)).send({ untilTomorrow: true });
    expect(res.status).toBe(200);
    expect(spHHMM(new Date(res.body.data.pausedUntil))).toBe('10:30');
  });

  it('corpo inválido: vazio, os dois juntos, untilTomorrow false', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await lojaDe(dono);
    for (const body of [{}, { minutes: 30, untilTomorrow: true }, { untilTomorrow: false }]) {
      const res = await request(app).put(`/api/stores/${store.id}/pause`).set('Authorization', bearer(dono)).send(body);
      expect(res.status).toBe(400);
    }
    expect((await prisma.store.findUnique({ where: { id: store.id } }) as any).pausedUntil).toBeNull();
  });

  it('outro lojista: 403 NOT_STORE_OWNER; loja inexistente: 404 STORE_NOT_FOUND; cliente: 403', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await lojaDe(dono);
    const intruso = await createTestUser('lojista', DOMAIN);
    const r1 = await request(app).put(`/api/stores/${store.id}/pause`).set('Authorization', bearer(intruso)).send({ minutes: 30 });
    expect(r1.status).toBe(403);
    expect(r1.body.error.code).toBe('NOT_STORE_OWNER');
    const r2 = await request(app).put('/api/stores/nao-existe-pause/pause').set('Authorization', bearer(dono)).send({ minutes: 30 });
    expect(r2.status).toBe(404);
    expect(r2.body.error.code).toBe('STORE_NOT_FOUND');
    const cliente = await createTestUser('cliente', DOMAIN);
    expect((await request(app).put(`/api/stores/${store.id}/pause`).set('Authorization', bearer(cliente)).send({ minutes: 30 })).status).toBe(403);
    expect((await prisma.store.findUnique({ where: { id: store.id } }) as any).pausedUntil).toBeNull();
  });
});

describe('DELETE /stores/:id/pause', () => {
  it('tira a pausa', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await lojaDe(dono, { pausedUntil: new Date(Date.now() + 3_600_000) });
    const res = await request(app).delete(`/api/stores/${store.id}/pause`).set('Authorization', bearer(dono));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { pausedUntil: null } });
    expect((await prisma.store.findUnique({ where: { id: store.id } }) as any).pausedUntil).toBeNull();
  });

  it('outro lojista não tira a pausa', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const until = new Date(Date.now() + 3_600_000);
    const store = await lojaDe(dono, { pausedUntil: until });
    const intruso = await createTestUser('lojista', DOMAIN);
    const res = await request(app).delete(`/api/stores/${store.id}/pause`).set('Authorization', bearer(intruso));
    expect(res.status).toBe(403);
    expect((await prisma.store.findUnique({ where: { id: store.id } }) as any).pausedUntil.getTime()).toBe(until.getTime());
  });
});
