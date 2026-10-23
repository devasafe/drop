/**
 * D3b-4b · P1.1: GET /admin/money/saas (spec 6.1). MRR a partir de effectiveFee, recebido no mês com a borda
 * de São Paulo (Review Focus 3), em atraso, situação das lojas, faturas do mês por cursor e o modo custódia.
 * Os números globais são conferidos por diferença (antes × depois), porque o banco de teste é compartilhado.
 * As faturas usam meses de 2033, e as listas filtram pelas lojas da suíte.
 */
import request from 'supertest';
import { Prisma } from '@prisma/client';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { ownerIdForStore } from './helpers/storeOwner';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { ValidationError } from '../utils/AppError';
import { toCents } from '../services/moneyOverview.service';
import {
  getSaasRevenue, paidMonthOf, saasMonthRange, type SaasRevenueDirect,
} from '../services/saasRevenue.service';

const DOMAIN = '@d3b4bp11.test';
const DAY = 24 * 60 * 60 * 1000;
let restoreConfig: () => Promise<void>;
let ceo: TestUser;
let seq = 0;

beforeAll(async () => {
  restoreConfig = await snapshotPlatformConfig();
});
afterAll(async () => {
  await restoreConfig();
});
beforeEach(async () => {
  await updatePlatformConfig({ settlementMode: 'direto', saasMonthlyFee: 50 }, 'test');
  ceo = await createTestUser('ceo', DOMAIN);
});
afterEach(async () => {
  // A loja sai pelo dono; StoreSaasBilling e SaasBillingPayment saem em cascata.
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function billingStore(name: string, data: Partial<Prisma.StoreSaasBillingUncheckedCreateInput> = {}) {
  const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore(DOMAIN), name, isOpen: true } });
  const billing = await prisma.storeSaasBilling.create({
    data: { trialEndsAt: new Date(Date.now() - 30 * DAY), status: 'active', ...data, storeId: store.id },
  });
  return { storeId: store.id, billingId: billing.id };
}

const invoiceData = (
  billingId: string,
  d: { value: number; dueDate: string; status?: string; paidAt?: string | null },
): Prisma.SaasBillingPaymentCreateManyInput => ({
  billingId,
  asaasPaymentId: `pay_d3b4b_${++seq}_${Math.random().toString(36).slice(2, 8)}`,
  value: d.value,
  dueDate: new Date(`${d.dueDate}T00:00:00.000Z`),
  status: d.status ?? 'PENDING',
  paidAt: d.paidAt ? new Date(d.paidAt) : null,
});

async function direct(query: { month?: string; cursor?: string } = {}, now?: Date): Promise<SaasRevenueDirect> {
  const r = await getSaasRevenue(query, now);
  if (r.mode !== 'direto') throw new Error('esperava o modo direto');
  return r;
}

const cents = (a: number, b: number) => toCents(b) - toCents(a);

describe('saasMonthRange e paidMonthOf', () => {
  it('janela de datas (calendário) e de instantes (São Paulo), inclusive na virada do ano', () => {
    expect(saasMonthRange('2033-12')).toEqual({
      month: '2033-12',
      dateStart: new Date('2033-12-01T00:00:00.000Z'),
      dateEnd: new Date('2034-01-01T00:00:00.000Z'),
      instantStart: new Date('2033-12-01T03:00:00.000Z'),
      instantEnd: new Date('2034-01-01T03:00:00.000Z'),
    });
  });

  it.each(['2033-13', '2033-00', '2033-1', 'abc', '', '1999-12', '2101-01', '2033-03-01'])('mês inválido "%s" → ValidationError', (m) => {
    expect(() => saasMonthRange(m)).toThrow(ValidationError);
    expect(() => saasMonthRange(m)).toThrow('Mês inválido (use AAAA-MM)');
  });

  it('data do Asaas (00:00Z) usa o calendário; instante usa o mês de São Paulo', () => {
    expect(paidMonthOf(new Date('2033-04-01T00:00:00.000Z'))).toBe('2033-04'); // data 01/04
    expect(paidMonthOf(new Date('2033-04-01T02:30:00.000Z'))).toBe('2033-03'); // 31/03 23:30 em SP
    expect(paidMonthOf(new Date('2033-03-01T02:59:59.999Z'))).toBe('2033-02'); // 28/02 23:59 em SP
    expect(paidMonthOf(new Date('2033-03-01T03:00:00.000Z'))).toBe('2033-03'); // 01/03 00:00 em SP
  });
});

describe('getSaasRevenue', () => {
  it('MRR soma effectiveFee das ativas e em atraso (padrão, especial e isenta); teste, pausada e cancelada não entram', async () => {
    const before = await direct({ month: '2033-03' });
    await billingStore('Ativa padrão');
    await billingStore('Ativa especial', { customFee: 30 });
    await billingStore('Ativa isenta', { customFee: 0 });
    await billingStore('Em atraso', { status: 'past_due' });
    await billingStore('Em teste', { status: 'trialing', trialEndsAt: new Date(Date.now() + 20 * DAY) });
    await billingStore('Pausada', { status: 'paused' });
    await billingStore('Cancelada', { status: 'cancelled', customFee: 99 });
    const after = await direct({ month: '2033-03' });

    expect(cents(before.mrr, after.mrr)).toBe(13000); // 50 + 30 + 0 + 50
    expect({
      trialing: after.byStatus.trialing - before.byStatus.trialing,
      active: after.byStatus.active - before.byStatus.active,
      past_due: after.byStatus.past_due - before.byStatus.past_due,
      paused: after.byStatus.paused - before.byStatus.paused,
      cancelled: after.byStatus.cancelled - before.byStatus.cancelled,
    }).toEqual({ trialing: 1, active: 3, past_due: 1, paused: 1, cancelled: 1 });
    expect(after.overdue.stores - before.overdue.stores).toBe(1);
  });

  it('Em atraso: soma só as faturas OVERDUE das lojas past_due', async () => {
    const before = await direct({ month: '2033-03' });
    const atrasada = await billingStore('Atrasada', { status: 'past_due' });
    const ativa = await billingStore('Ativa com fatura velha');
    await prisma.saasBillingPayment.createMany({
      data: [
        invoiceData(atrasada.billingId, { value: 50, dueDate: '2033-01-10', status: 'OVERDUE' }),
        invoiceData(atrasada.billingId, { value: 25.5, dueDate: '2033-02-10', status: 'OVERDUE' }),
        invoiceData(atrasada.billingId, { value: 50, dueDate: '2033-03-10', status: 'PENDING' }),
        invoiceData(ativa.billingId, { value: 40, dueDate: '2033-02-10', status: 'OVERDUE' }),
      ],
    });
    const after = await direct({ month: '2033-03' });
    expect(after.overdue.stores - before.overdue.stores).toBe(1);
    expect(cents(before.overdue.amount, after.overdue.amount)).toBe(7550);
  });

  it('trialsEndingIn7Days: só loja em teste cujo teste acaba entre agora e 7 dias', async () => {
    const now = new Date();
    const before = await direct({ month: '2033-03' }, now);
    const at = (ms: number) => new Date(now.getTime() + ms);
    await billingStore('Acaba em 3 dias', { status: 'trialing', trialEndsAt: at(3 * DAY) });
    await billingStore('Acaba no limite', { status: 'trialing', trialEndsAt: at(7 * DAY) });
    await billingStore('Acaba em 8 dias', { status: 'trialing', trialEndsAt: at(8 * DAY) });
    await billingStore('Já acabou', { status: 'trialing', trialEndsAt: at(-DAY) });
    await billingStore('Ativa', { status: 'active', trialEndsAt: at(2 * DAY) });
    const after = await direct({ month: '2033-03' }, now);
    expect(after.trialsEndingIn7Days - before.trialsEndingIn7Days).toBe(2);
  });

  it('Recebido no mês segue o mês de São Paulo nas bordas e só conta fatura paga (Review Focus 3)', async () => {
    const months = ['2033-02', '2033-03', '2033-04'];
    const before = await Promise.all(months.map((month) => direct({ month })));
    const { billingId } = await billingStore('Loja Bordas');
    await prisma.saasBillingPayment.createMany({
      data: [
        // instante: 31/03 23:30 em SP = 01/04 02:30Z → março
        invoiceData(billingId, { value: 10, dueDate: '2033-03-31', status: 'RECEIVED', paidAt: '2033-04-01T02:30:00.000Z' }),
        // instante: 28/02 23:59 em SP = 01/03 02:59Z → fevereiro
        invoiceData(billingId, { value: 20, dueDate: '2033-02-28', status: 'RECEIVED', paidAt: '2033-03-01T02:59:59.999Z' }),
        // data do Asaas 01/03 (00:00Z) → março, mesmo sendo 28/02 21:00 em SP
        invoiceData(billingId, { value: 40, dueDate: '2033-03-01', status: 'CONFIRMED', paidAt: '2033-03-01T00:00:00.000Z' }),
        // data do Asaas 01/04 → abril
        invoiceData(billingId, { value: 80, dueDate: '2033-04-01', status: 'RECEIVED_IN_CASH', paidAt: '2033-04-01T00:00:00.000Z' }),
        // estornada mantém o paidAt, mas não é recebida
        invoiceData(billingId, { value: 160, dueDate: '2033-03-05', status: 'REFUNDED', paidAt: '2033-03-05T00:00:00.000Z' }),
        // pendente: não conta
        invoiceData(billingId, { value: 320, dueDate: '2033-03-06', status: 'PENDING' }),
      ],
    });
    const after = await Promise.all(months.map((month) => direct({ month })));
    expect(months.map((m, i) => cents(before[i].receivedThisMonth, after[i].receivedThisMonth))).toEqual([2000, 5000, 8000]);
    for (const [i, m] of months.entries()) expect(after[i].month).toBe(m);
  });

  it('Faturas do mês: vencimento dentro do mês (data do Asaas), com loja, valor e status cru; ordem por vencimento', async () => {
    const { storeId, billingId } = await billingStore('Loja Fatura');
    await prisma.saasBillingPayment.createMany({
      data: [
        invoiceData(billingId, { value: 49.9, dueDate: '2033-05-31', status: 'RECEIVED', paidAt: '2033-05-31T00:00:00.000Z' }),
        invoiceData(billingId, { value: 49.9, dueDate: '2033-05-01', status: 'PENDING' }),
        invoiceData(billingId, { value: 49.9, dueDate: '2033-05-10', status: 'DELETED' }),
        invoiceData(billingId, { value: 49.9, dueDate: '2033-06-01', status: 'PENDING' }),
        invoiceData(billingId, { value: 49.9, dueDate: '2033-04-30', status: 'OVERDUE' }),
      ],
    });
    const r = await direct({ month: '2033-05' });
    const mine = r.invoices.items.filter((i) => i.storeId === storeId);
    expect(mine).toEqual([
      { id: expect.any(String), storeId, storeName: 'Loja Fatura', value: 49.9, dueDate: '2033-05-01', status: 'PENDING', paidAt: null },
      { id: expect.any(String), storeId, storeName: 'Loja Fatura', value: 49.9, dueDate: '2033-05-10', status: 'DELETED', paidAt: null },
      { id: expect.any(String), storeId, storeName: 'Loja Fatura', value: 49.9, dueDate: '2033-05-31', status: 'RECEIVED', paidAt: '2033-05-31T00:00:00.000Z' },
    ]);
  });

  it('pagina de 50 em 50 pelo cursor, sem repetir nem pular, com vencimentos iguais', async () => {
    const { storeId, billingId } = await billingStore('Loja Muitas');
    await prisma.saasBillingPayment.createMany({
      data: Array.from({ length: 60 }, (_, i) => invoiceData(billingId, {
        value: 10,
        dueDate: i < 30 ? '2033-07-10' : `2033-07-${String(i - 29).padStart(2, '0')}`,
      })),
    });
    const sizes: number[] = [];
    const seen: Array<{ id: string; dueDate: string }> = [];
    let cursor: string | undefined;
    for (let p = 0; p < 5; p++) {
      const r = await direct({ month: '2033-07', cursor });
      sizes.push(r.invoices.items.length);
      seen.push(...r.invoices.items.filter((i) => i.storeId === storeId).map((i) => ({ id: i.id, dueDate: i.dueDate })));
      if (!r.invoices.nextCursor) break;
      cursor = r.invoices.nextCursor;
    }
    expect(sizes[0]).toBe(50);
    expect(seen).toHaveLength(60);
    expect(new Set(seen.map((s) => s.id)).size).toBe(60);
    const sorted = [...seen].sort((a, b) => (a.dueDate === b.dueDate ? (a.id < b.id ? -1 : 1) : a.dueDate < b.dueDate ? -1 : 1));
    expect(seen).toEqual(sorted);
  });

  it('sem month: o mês atual de São Paulo', async () => {
    expect((await direct({}, new Date('2033-04-01T02:30:00.000Z'))).month).toBe('2033-03');
    expect((await direct({}, new Date('2033-04-01T03:00:00.000Z'))).month).toBe('2033-04');
  });

  it('cursor inválido → ValidationError', async () => {
    await expect(getSaasRevenue({ month: '2033-03', cursor: 'xx' })).rejects.toThrow('Cursor inválido');
  });

  it('custódia: { mode: "custodia" } sem números', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' }, 'test');
    await billingStore('Ativa na custódia');
    expect(await getSaasRevenue({ month: '2033-03' })).toEqual({ mode: 'custodia' });
  });
});

describe('GET /api/admin/money/saas', () => {
  const get = (u?: TestUser, qs = '') => {
    const r = request(app).get(`/api/admin/money/saas${qs}`);
    return u ? r.set('Authorization', bearer(u)) : r;
  };

  it('CEO recebe o formato combinado do modo direto', async () => {
    const r = await get(ceo, '?month=2033-03');
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(
      ['byStatus', 'invoices', 'mode', 'month', 'mrr', 'overdue', 'receivedThisMonth', 'trialsEndingIn7Days'],
    );
    expect(r.body).toMatchObject({ mode: 'direto', month: '2033-03' });
    expect(Object.keys(r.body.byStatus).sort()).toEqual(['active', 'cancelled', 'past_due', 'paused', 'trialing']);
    expect(Object.keys(r.body.invoices).sort()).toEqual(['items', 'nextCursor']);
  });

  it('custódia → { mode: "custodia" }', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' }, 'test');
    const r = await get(ceo);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ mode: 'custodia' });
  });

  it('mês ou cursor inválido → 400 com a mensagem; month repetido → 400', async () => {
    const bad = await get(ceo, '?month=2033-13');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Mês inválido (use AAAA-MM)');
    const badCursor = await get(ceo, '?month=2033-03&cursor=xx');
    expect(badCursor.status).toBe(400);
    expect(badCursor.body.error).toBe('Cursor inválido');
    expect((await get(ceo, '?month=2033-03&month=2033-04')).status).toBe(400);
  });

  it('sem login → 401; papel sem money:overview → 403', async () => {
    expect((await get()).status).toBe(401);
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    expect((await get(gerente)).status).toBe(403);
  });
});
