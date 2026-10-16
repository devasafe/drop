import {
  NUMEROS_PERIODS, deltaHint, avgTicket, commissionShare, cohortLevel, cohortMonth, platformInsights, pct,
} from '../adminNumeros';
import type { PlatformOverview, FunnelData, TopStore } from '../analyticsApi';

const overview = (delta: Partial<PlatformOverview['delta']> = {}, gmv = 10000): PlatformOverview => ({
  period: { days: 30, start: '', end: '' },
  current: { totalUsers: 1, newUsers: 1, activeUsers: 1, totalStores: 1, newStores: 0, gmv, commission: 1000, orders: 10 },
  previous: { newUsers: 1, activeUsers: 1, gmv: 1, commission: 1, orders: 1 },
  delta: { newUsers: 0, activeUsers: 0, gmv: 0, commission: 0, orders: 0, ...delta },
});
const funnel = (first: number, second: number): FunnelData => ({
  steps: [], conversionRates: { registerToFirstOrder: first, firstOrderToSecond: second },
});
const store = (name: string, revenue: number): TopStore => ({ _id: name, name, orders: 1, revenue, commission: 0, avgTicket: 0 });

describe('adminNumeros', () => {
  it('os períodos de hoje: 7, 30 e 90 dias', () => {
    expect(NUMEROS_PERIODS).toEqual([
      { value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' }, { value: '90d', label: '90 dias' },
    ]);
  });

  it('deltaHint: sinal, uma casa e o período', () => {
    expect(deltaHint(18, 30)).toBe('+18% sobre os 30 dias anteriores');
    expect(deltaHint(-3.2, 7)).toBe('−3,2% sobre os 7 dias anteriores');
    expect(deltaHint(0, 90)).toBe('0% sobre os 90 dias anteriores');
    expect(deltaHint(NaN, 30)).toBe('sem comparação com os 30 dias anteriores');
    expect(deltaHint(undefined, 30)).toBe('sem comparação com os 30 dias anteriores');
  });

  it('ticket médio e fatia da receita: sem divisão por zero', () => {
    expect(avgTicket(320, 4)).toBe(80);
    expect(avgTicket(100, 0)).toBeNull();
    expect(commissionShare(1000, 10000)).toBe(10);
    expect(commissionShare(5, 0)).toBeNull();
    expect(pct(10)).toBe('10%');
    expect(pct(3.25)).toBe('3,3%');
  });

  it('retenção: nível da célula e nome do mês', () => {
    expect(cohortLevel(undefined)).toBe('none');
    expect(cohortLevel(0)).toBe('low');
    expect(cohortLevel(24.9)).toBe('low');
    expect(cohortLevel(25)).toBe('mid');
    expect(cohortLevel(50)).toBe('high');
    expect(cohortMonth('2026-08')).toBe('ago/2026');
    expect(cohortMonth('2026-12')).toBe('dez/2026');
    expect(cohortMonth('xx')).toBe('xx');
  });

  describe('platformInsights (mesmos limites do analytics antigo)', () => {
    it('nada chama atenção: lista vazia', () => {
      expect(platformInsights(overview(), funnel(50, 50), [])).toEqual([]);
    });
    it('cadastros: sobe acima de 20%, cai abaixo de -10%', () => {
      expect(platformInsights(overview({ newUsers: 21 }), null, [])[0]).toContain('cresceram 21%');
      expect(platformInsights(overview({ newUsers: -11 }), null, [])[0]).toContain('caíram 11%');
      expect(platformInsights(overview({ newUsers: 20 }), null, [])).toEqual([]);
    });
    it('funil: primeiro pedido abaixo de 30% e volta abaixo de 40% (e acima de 0)', () => {
      const l = platformInsights(overview(), funnel(29, 39), []);
      expect(l).toHaveLength(2);
      expect(l[0]).toContain('29%');
      expect(l[1]).toContain('39%');
      expect(platformInsights(overview(), funnel(30, 0), [])).toEqual([]);
    });
    it('vendido acima de 15% cita a receita; 5 lojas acima de 60% do vendido; loja que mais vendeu', () => {
      const l = platformInsights(overview({ gmv: 16, commission: 12 }), null, [store('Pet Bom', 7000)]);
      expect(l[0]).toContain('16%');
      expect(l[0]).toContain('12%');
      expect(l[1]).toContain('70%');
      expect(l[2]).toMatch(/Pet Bom, com R\$\s?7\.000,00/);
    });
    it('sem inglês', () => {
      const l = platformInsights(overview({ newUsers: 30, gmv: 20 }), funnel(10, 10), [store('A', 9000)]);
      expect(l.join(' ')).not.toMatch(/long tail|remarketing|onboarding|cohort|GMV/i);
    });
  });
});
