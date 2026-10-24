/** Operação real · repasse ao motoboy de R$ 0 não vira linha (nenhum Pix de valor zero ao Asaas). */
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});

import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { createTransferForDelivery } from '../services/asaasLoja/motoboyTransfer';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';

const DOMAIN = '@oprealzero.test';

let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); await prisma.$disconnect(); });
beforeEach(async () => {
  await updatePlatformConfig({ directTransferMaxAmount: 150, motoboyShareDirect: 100 } as any, 'test');
});
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.motoboyTransfer.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function setup() {
  const lojista = await createTestUser('lojista', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  await prisma.user.update({ where: { id: motoboy.userId }, data: { asaas: { pixKey: '12345678909', pixKeyType: 'CPF' } } as any });
  const store = await prisma.store.create({ data: { ownerId: lojista.userId, name: 'Loja Zero', isOpen: true } as any });
  return { motoboy, store };
}
const create = (store: { id: string }, motoboyId: string, fee: number, override?: number) =>
  prisma.$transaction((tx) => createTransferForDelivery(
    tx, { id: `del-zero-${Date.now()}-${Math.random()}`, motoboyId, fee }, { id: `ordzero${Date.now()}`, storeId: store.id },
    override != null ? 'cancellation_compensation' : 'delivery', override,
  ));

describe('repasse de R$ 0', () => {
  it('entrega com frete zero não cria linha de Pix', async () => {
    const { motoboy, store } = await setup();
    expect(await create(store, motoboy.userId, 0)).toBeNull();
    expect(await prisma.motoboyTransfer.count({ where: { storeId: store.id } })).toBe(0);
  });

  it('parte do motoboy em 0% também não cria linha', async () => {
    await updatePlatformConfig({ motoboyShareDirect: 0 } as any, 'test');
    const { motoboy, store } = await setup();
    expect(await create(store, motoboy.userId, 10)).toBeNull();
    expect(await prisma.motoboyTransfer.count({ where: { storeId: store.id } })).toBe(0);
  });

  it('compensação de cancelamento de R$ 0 não cria linha', async () => {
    const { motoboy, store } = await setup();
    expect(await create(store, motoboy.userId, 0, 0)).toBeNull();
  });

  it('um centavo ainda vira Pix pendente', async () => {
    const { motoboy, store } = await setup();
    const row = await create(store, motoboy.userId, 0.01);
    expect(row?.status).toBe('pending');
    expect(Number(row?.amount)).toBe(0.01);
  });
});
