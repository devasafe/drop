/** Operação real · no modo SaaS (direto) aprovar o motoboy não cria subconta na conta Asaas da DROP. */
jest.mock('../services/asaas/subaccount', () => {
  const actual = jest.requireActual('../services/asaas/subaccount');
  return { __esModule: true, ...actual, ensureMotoboySubaccount: jest.fn().mockResolvedValue(undefined) };
});

import env from '../config/env';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { ensureMotoboySubaccount } from '../services/asaas/subaccount';
import { ensureCourierSubaccountSafe } from '../services/verification/sideEffects';
import { snapshotPlatformConfig } from './helpers/pgCleanup';

const ensure = ensureMotoboySubaccount as jest.Mock;
const originalGateway = env.PAYMENT_GATEWAY;

let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { env.PAYMENT_GATEWAY = originalGateway; await restore(); await prisma.$disconnect(); });
beforeEach(() => { ensure.mockClear(); (env as any).PAYMENT_GATEWAY = 'asaas'; });

describe('subconta do motoboy na aprovação', () => {
  it('modo direto (SaaS): não cria subconta', async () => {
    await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test');
    await ensureCourierSubaccountSafe('motoboy-1');
    expect(ensure).not.toHaveBeenCalled();
  });

  it('custódia: cria a subconta como antes', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    await ensureCourierSubaccountSafe('motoboy-2');
    expect(ensure).toHaveBeenCalledWith('motoboy-2');
  });
});
