/**
 * Regressão (riscos remanescentes 2026-10-07) — f12: fallback SSE de notifyMotoboys.
 * Sem Socket.io, a oferta de corrida ia para TODOS os clientes SSE (clientes, lojas…).
 * Agora só para motoboys que poderiam estar na sala `motoboys` (KYC aprovado, não bloqueado).
 */
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';
import { addClient, removeClient, notifyMotoboys } from '../services/notifier';

const DOMAIN = '@sf12.test';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

const fakeRes = () => ({ write: jest.fn() }) as any;
const settle = () => new Promise((r) => setTimeout(r, 300));

describe('f12 — notifyMotoboys via SSE', () => {
  it('só motoboy verificado recebe a oferta', async () => {
    const mb = await createTestUser('motoboy', DOMAIN);
    const pendente = await createTestUser('motoboy', DOMAIN, { verified: false });
    const cliente = await createTestUser('cliente', DOMAIN);
    const rMb = fakeRes(); const rPend = fakeRes(); const rCli = fakeRes();
    addClient(mb.userId, rMb, 'motoboy');
    addClient(pendente.userId, rPend, 'motoboy');
    addClient(cliente.userId, rCli, 'cliente');
    try {
      notifyMotoboys({ type: 'new_delivery', delivery: { id: 'd1' } });
      await settle();
      expect(rMb.write).toHaveBeenCalled();
      expect(rPend.write).not.toHaveBeenCalled();
      expect(rCli.write).not.toHaveBeenCalled();
    } finally {
      removeClient(mb.userId, rMb); removeClient(pendente.userId, rPend); removeClient(cliente.userId, rCli);
    }
    expect(await prisma.user.count({ where: { id: mb.userId } })).toBe(1);
  });
});
