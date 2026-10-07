/**
 * Regressão (auditoria de segurança 2026-10-07) — item 4: gamificação.
 *  - Pontos só por evento interno do servidor (PIN de entrega, avaliação): não existe
 *    mais POST /gamification/:user_id/add (era público, sem autenticação).
 *  - Resgate usa sempre o usuário do token, nunca `user_id` do corpo.
 *  - Leitura da gamificação exige login.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { defaultGam, findGamByUser, persistGam } from '../repositories/gamification.repository';
import { ensurePlatformConfig, updatePlatformConfig } from '../repositories/platformConfig.repository';

const DOMAIN = '@sec04.test';
const created: string[] = [];
let restoreConfig: () => Promise<void>;

beforeAll(async () => {
  restoreConfig = await snapshotPlatformConfig();
  await ensurePlatformConfig('test');
  // Freios ligados: o pior caso — sem eles a falha ficava "contida".
  await updatePlatformConfig(
    { gamificationPointsEnabled: true, benefitsRedeemEnabled: true },
    'test'
  );
});

afterAll(async () => {
  await restoreConfig();
});

afterEach(async () => {
  await prisma.gamification.deleteMany({ where: { userId: { in: created.splice(0) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function motoboyWithPoints(points: number) {
  const u = await createTestUser('motoboy', DOMAIN);
  created.push(u.userId);
  await persistGam({ ...defaultGam(u.userId), points, totalPoints: points });
  return u;
}

describe('Item 4 — pontos não podem ser somados por chamada direta', () => {
  it('POST /gamification/:id/add não existe (nem anônimo, nem logado)', async () => {
    const vitima = await motoboyWithPoints(0);

    const anon = await request(app).post(`/api/gamification/${vitima.userId}/add`).send({ points: 99999 });
    expect(anon.status).toBe(404);

    const logado = await request(app)
      .post(`/api/gamification/${vitima.userId}/add`)
      .set('Authorization', bearer(vitima))
      .send({ points: 99999 });
    expect(logado.status).toBe(404);

    const gam = await findGamByUser(vitima.userId);
    expect(gam?.points).toBe(0);
  });

  it('GET /gamification/:id exige login', async () => {
    const m = await motoboyWithPoints(10);
    const res = await request(app).get(`/api/gamification/${m.userId}`);
    expect(res.status).toBe(401);
  });
});

describe('Item 4 — resgate usa o usuário do token', () => {
  it('ignora user_id de outro motoboy no corpo', async () => {
    const vitima = await motoboyWithPoints(600);
    const atacante = await motoboyWithPoints(0);

    const res = await request(app)
      .post('/api/gamification/redeem')
      .set('Authorization', bearer(atacante))
      .send({ user_id: vitima.userId, benefit: 'wallet_bonus_20' });

    expect(res.status).toBe(400); // pontos insuficientes do PRÓPRIO atacante
    expect((await findGamByUser(vitima.userId))?.points).toBe(600);
    const wallet = await prisma.wallet.findFirst({ where: { owner: vitima.userId, ownerType: 'motoboy' } });
    expect(Number(wallet?.balance ?? 0)).toBe(0);
  });

  it('resgate legítimo debita os pontos do próprio motoboy', async () => {
    const m = await motoboyWithPoints(600);
    const res = await request(app)
      .post('/api/gamification/redeem')
      .set('Authorization', bearer(m))
      .send({ benefit: 'wallet_bonus_20' });
    expect(res.status).toBe(200);
    expect((await findGamByUser(m.userId))?.points).toBe(100);
  });

  it('papel que não é motoboy não resgata', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    created.push(cliente.userId);
    const res = await request(app)
      .post('/api/gamification/redeem')
      .set('Authorization', bearer(cliente))
      .send({ benefit: 'wallet_bonus_20' });
    expect(res.status).toBe(403);
  });
});
