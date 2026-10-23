/** D3b-4a · T1: diff campo a campo e gravação em lote do histórico de regras. */
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { diffRules, recordRuleChanges } from '../services/rules/ruleChanges';

const actor = { id: 'd3b4a-t1-actor', role: 'ceo' };
afterEach(() => prisma.platformRuleChange.deleteMany({ where: { actorId: actor.id } }));

describe('diffRules', () => {
  it('só devolve o que mudou; número compara por valor (Decimal, texto e número)', () => {
    const current = { motoboyCutPerKm: new Prisma.Decimal('1.20'), poolTimeoutMin: 15, directCardEnabled: false, seasonalTheme: 'none' };
    expect(diffRules(current, { motoboyCutPerKm: 1.2, poolTimeoutMin: 15 })).toEqual([]);
    expect(diffRules(current, { motoboyCutPerKm: 1.5, directCardEnabled: true, seasonalTheme: 'natal' })).toEqual([
      { field: 'motoboyCutPerKm', before: 1.2, after: 1.5 },
      { field: 'directCardEnabled', before: false, after: true },
      { field: 'seasonalTheme', before: 'none', after: 'natal' },
    ]);
  });

  it('0 é um valor como outro qualquer', () => {
    expect(diffRules({ cardFeeFixed: new Prisma.Decimal('0.49') }, { cardFeeFixed: 0 })).toEqual([
      { field: 'cardFeeFixed', before: 0.49, after: 0 },
    ]);
  });
});

describe('recordRuleChanges', () => {
  it('sem mudança não grava nada', async () => {
    const r = await prisma.$transaction((tx) => recordRuleChanges(tx, { actor, source: 'rules', changes: [] }));
    expect(r).toEqual({ batchId: null, count: 0 });
    expect(await prisma.platformRuleChange.count({ where: { actorId: actor.id } })).toBe(0);
  });

  it('um lote: mesmo batchId, motivo aparado, meta por campo', async () => {
    const r = await prisma.$transaction((tx) => recordRuleChanges(tx, {
      actor, source: 'rules', reason: '  reajuste de outubro  ',
      changes: [{ field: 'commissionPlan1', before: 10, after: 12 }, { field: 'poolTimeoutMin', before: 15, after: 20 }],
      meta: { commissionPlan1: { choice: 'all', storesUpdated: 3 } },
    }));
    expect(r.count).toBe(2);
    const rows = await prisma.platformRuleChange.findMany({ where: { actorId: actor.id }, orderBy: { field: 'asc' } });
    expect(rows.map((x) => x.batchId)).toEqual([r.batchId, r.batchId]);
    expect(rows[0]).toMatchObject({ field: 'commissionPlan1', before: 10, after: 12, reason: 'reajuste de outubro', actorRole: 'ceo', source: 'rules', meta: { choice: 'all', storesUpdated: 3 } });
    expect(rows[1]).toMatchObject({ field: 'poolTimeoutMin', meta: null });
  });

  it('motivo vazio vira null', async () => {
    await prisma.$transaction((tx) => recordRuleChanges(tx, { actor, source: 'switches', reason: '   ', changes: [{ field: 'directCardEnabled', before: false, after: true }] }));
    expect((await prisma.platformRuleChange.findFirst({ where: { actorId: actor.id } }))!.reason).toBeNull();
  });
});
