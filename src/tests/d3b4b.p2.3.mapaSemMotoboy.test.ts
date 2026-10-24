/**
 * D3b-4b · P2.3 — GET /admin/ops/map traz storesWithoutCourier (spec 7.2): lojas abertas pela regra da vitrine
 * (interruptor, pausa do DROP, pausa do lojista e horário, isStoreOpenWithHoursNow), com coordenada e com 0
 * motoboy online a até DISPATCH_MAX_KM. Motoboy sem sinal não conta; motoboy em entrega conta (está online).
 * Loja sem coordenada fica de fora (Review Focus 1).
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { cleanupOpsFixtures, createOpsOrder, createOpsStore } from './helpers/d3b1Ops';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { storesWithoutCourier } from '../services/adminOps/couriersNear';
import { STALE_LOCATION_MS } from '../services/adminOps/map';
import { paymentsReadyStoreData } from './helpers/storeConsent';

const DOMAIN = '@d3b4bp23.test';
const MARK = 'd3b4bp23';
const CLOSED_ALL_WEEK = Object.fromEntries(
  ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, { closed: true }]),
);

let restoreConfig: () => Promise<void>;
let ceo: TestUser;
let customerId: string;

beforeAll(async () => {
  restoreConfig = await snapshotPlatformConfig();
});
afterAll(async () => {
  await restoreConfig();
});
beforeEach(async () => {
  // Custódia: a mensalidade não esconde a loja da vitrine.
  await updatePlatformConfig({ settlementMode: 'custodia' }, 'd3b4b-p23');
  ceo = await createTestUser('ceo', DOMAIN);
  customerId = (await createTestUser('cliente', DOMAIN)).userId;
});
afterEach(async () => {
  await cleanupOpsFixtures(DOMAIN, MARK);
});

/** createOpsStore não verifica a loja, e o jest liga KYC_ENFORCED: sem isVerified a vitrine esconderia todas. */
async function verificada(id: string): Promise<string> {
  await prisma.store.update({ where: { id }, data: { isVerified: true, ...paymentsReadyStoreData() } as any });
  return id;
}

/** Loja aberta (createOpsStore: isOpen, sem horário = sempre aberta) em (1°, lng). 0,5° de longitude ≈ 55 km. */
const lojaEm = async (name: string, lng: number) =>
  verificada(await createOpsStore(DOMAIN, { name, latitude: '1', longitude: String(lng) }));

/** Motoboy online a ~1 km ao norte da loja em (1°, lng), com a posição gravada em `at`. */
async function motoboyPerto(lng: number, at: Date): Promise<string> {
  const m = await createTestUser('motoboy', DOMAIN);
  await prisma.user.update({
    where: { id: m.userId },
    data: { isOnline: true, currentLocation: { lat: 1.009, lng, updatedAt: at.toISOString() } },
  });
  return m.userId;
}

describe('storesWithoutCourier', () => {
  it('só loja aberta, com ponto e sem ninguém online no raio', async () => {
    const now = new Date();
    const semNinguem = await lojaEm('P23 Sem Ninguém', 1);
    const comLivre = await lojaEm('P23 Com Livre', 1.5);
    const soSemSinal = await lojaEm('P23 Só Sem Sinal', 2);
    const soOcupado = await lojaEm('P23 Só Ocupado', 2.5);
    const fechada = await lojaEm('P23 Fechada', 3);
    const pausadaDrop = await lojaEm('P23 Pausada DROP', 3.5);
    const pausadaLojista = await lojaEm('P23 Pausada Lojista', 4);
    const foraDoHorario = await lojaEm('P23 Fora do Horário', 4.5);
    const semPonto = await verificada(await createOpsStore(DOMAIN, { name: 'P23 Sem Ponto' }));
    await prisma.store.update({ where: { id: fechada }, data: { isOpen: false } });
    await prisma.store.update({
      where: { id: pausadaDrop },
      data: { adminPausedAt: now, adminPausedBy: ceo.userId, adminPauseReason: 'Teste' },
    });
    await prisma.store.update({ where: { id: pausadaLojista }, data: { pausedUntil: new Date(now.getTime() + 60 * 60_000) } });
    await prisma.store.update({ where: { id: foraDoHorario }, data: { operatingHours: CLOSED_ALL_WEEK } });
    await motoboyPerto(1.5, now);
    await motoboyPerto(2, new Date(now.getTime() - STALE_LOCATION_MS - 60_000));
    const ocupado = await motoboyPerto(2.5, now);
    await createOpsOrder({
      customerId, storeId: soOcupado, status: 'aguardando_motoboy', acceptedAt: now,
      delivery: { status: 'assigned', motoboyId: ocupado, assignedAt: now },
    });

    const list = await storesWithoutCourier(now);
    const mine = list.filter((s) => s.name.startsWith('P23 '));
    expect(mine).toHaveLength(2);
    expect(mine).toEqual(expect.arrayContaining([
      { id: semNinguem, name: 'P23 Sem Ninguém', lat: 1, lng: 1 },
      { id: soSemSinal, name: 'P23 Só Sem Sinal', lat: 1, lng: 2 },
    ]));
    const ids = list.map((s) => s.id);
    for (const fora of [comLivre, soOcupado, fechada, pausadaDrop, pausadaLojista, foraDoHorario, semPonto]) {
      expect(ids).not.toContain(fora);
    }
  });
});

describe('storesWithoutCourier: visibilidade da vitrine (R5) e horário', () => {
  it('loja não verificada (KYC) fica de fora', async () => {
    const visivel = await lojaEm('P23 Visível', 1);
    const naoVerificada = await lojaEm('P23 Não Verificada', 1.5);
    await prisma.store.update({ where: { id: naoVerificada }, data: { isVerified: false } });

    const ids = (await storesWithoutCourier(new Date())).map((s) => s.id);
    expect(ids).toContain(visivel);
    expect(ids).not.toContain(naoVerificada);
  });

  it('loja escondida pela mensalidade no modo direto fica de fora (e volta na custódia)', async () => {
    const visivel = await lojaEm('P23 Visível', 1);
    const escondida = await lojaEm('P23 Mensalidade Pausada', 1.5);
    await prisma.storeSaasBilling.create({
      data: { storeId: escondida, status: 'paused', trialEndsAt: new Date(Date.now() - 30 * 86_400_000), pausedAt: new Date() },
    });

    await updatePlatformConfig({ settlementMode: 'direto' } as any, 'd3b4b-p23');
    const direto = (await storesWithoutCourier(new Date())).map((s) => s.id);
    expect(direto).toContain(visivel);
    expect(direto).not.toContain(escondida);

    await updatePlatformConfig({ settlementMode: 'custodia' }, 'd3b4b-p23');
    expect((await storesWithoutCourier(new Date())).map((s) => s.id)).toContain(escondida);
  });

  it('fora do horário, mas com openOverrideUntil no futuro, aparece', async () => {
    const now = new Date();
    const foraDoHorario = await lojaEm('P23 Fora do Horário', 1);
    const comOverride = await lojaEm('P23 Override', 1.5);
    await prisma.store.update({ where: { id: foraDoHorario }, data: { operatingHours: CLOSED_ALL_WEEK } });
    await prisma.store.update({
      where: { id: comOverride },
      data: { operatingHours: CLOSED_ALL_WEEK, openOverrideUntil: new Date(now.getTime() + 60 * 60_000) },
    });

    const ids = (await storesWithoutCourier(now)).map((s) => s.id);
    expect(ids).toContain(comOverride);
    expect(ids).not.toContain(foraDoHorario);
  });
});

describe('GET /api/admin/ops/map', () => {
  it('traz storesWithoutCourier ao lado das chaves de antes', async () => {
    const semNinguem = await lojaEm('P23 Sem Ninguém', 1);

    const r = await request(app).get('/api/admin/ops/map').set('Authorization', bearer(ceo));
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['dispatch', 'inDelivery', 'motoboys', 'storesWithoutCourier', 'waiting']);
    expect(r.body.storesWithoutCourier).toContainEqual({ id: semNinguem, name: 'P23 Sem Ninguém', lat: 1, lng: 1 });
  });
});
