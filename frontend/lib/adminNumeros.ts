/**
 * Números do negócio (D3a, spec 5.5): formatação e leituras da tela. Só dados que o servidor já manda
 * (/wallets/platform/metrics e /analytics/platform/*); comparação = `delta` do overview (período anterior de mesmo tamanho).
 */
import type { FunnelData, PlatformOverview, TopStore } from './analyticsApi';

export interface PlatformMetrics {
  totalBalance: number;
  totalIncome: number;
  totalSpent: number;
  /** Mais novas primeiro (o servidor manda as 20 últimas em ordem decrescente). */
  history: Array<{ date: string; type: 'credit' | 'debit'; amount: number; reason?: string | null }>;
}

/** Os períodos de hoje (o analytics antigo). "Hoje" e "Personalizado" são D3b. */
export const NUMEROS_PERIODS: Array<{ value: '7d' | '30d' | '90d'; label: string }> = [
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
];

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NUM = new Intl.NumberFormat('pt-BR');
const PCT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export const brl = (v: number): string => BRL.format(v);
export const num = (v: number): string => NUM.format(v);
export const pct = (v: number): string => `${PCT.format(v)}%`;

export function deltaHint(delta: number | null | undefined, days: number): string {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return `sem comparação com os ${days} dias anteriores`;
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  return `${sign}${PCT.format(Math.abs(delta))}% sobre os ${days} dias anteriores`;
}

export function avgTicket(gmv: number, orders: number): number | null {
  return orders > 0 ? gmv / orders : null;
}

export function commissionShare(commission: number, gmv: number): number | null {
  return gmv > 0 ? (commission / gmv) * 100 : null;
}

export type CohortLevel = 'none' | 'low' | 'mid' | 'high';

/** Intensidade da célula de retenção (o número sempre aparece; a cor só reforça). */
export function cohortLevel(v: number | undefined): CohortLevel {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'none';
  if (v >= 50) return 'high';
  if (v >= 25) return 'mid';
  return 'low';
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** '2026-08' → 'ago/2026'. Formato inesperado volta como veio. */
export function cohortMonth(cohort: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(cohort);
  if (!m) return cohort;
  const idx = Number(m[2]) - 1;
  return MONTHS[idx] ? `${MONTHS[idx]}/${m[1]}` : cohort;
}

/** "O que chama atenção": os mesmos limites das "Recomendações estratégicas" do analytics antigo, em texto simples. */
export function platformInsights(overview: PlatformOverview, funnel: FunnelData | null, topStores: TopStore[]): string[] {
  const list: string[] = [];
  const d = overview.delta;

  if (d.newUsers > 20) {
    list.push(`Os cadastros novos cresceram ${PCT.format(d.newUsers)}%. Bom momento para campanhas de primeiro pedido.`);
  } else if (d.newUsers < -10) {
    list.push(`Os cadastros novos caíram ${PCT.format(Math.abs(d.newUsers))}%. Vale revisar de onde vêm as pessoas.`);
  }

  if (funnel && funnel.conversionRates.registerToFirstOrder < 30) {
    list.push(`Só ${Math.round(funnel.conversionRates.registerToFirstOrder)}% de quem se cadastra faz o primeiro pedido. Um cupom de boas-vindas pode ajudar.`);
  }
  if (funnel && funnel.conversionRates.firstOrderToSecond > 0 && funnel.conversionRates.firstOrderToSecond < 40) {
    list.push(`Só ${Math.round(funnel.conversionRates.firstOrderToSecond)}% voltam para o segundo pedido. Avisos depois da compra podem ajudar.`);
  }

  if (d.gmv > 15) {
    list.push(`O vendido cresceu ${PCT.format(d.gmv)}%, e a receita do DROP ${PCT.format(d.commission)}%.`);
  }

  if (topStores.length > 0 && topStores[0].revenue > 0) {
    const top = topStores[0];
    const top5 = topStores.slice(0, 5).reduce((s, t) => s + t.revenue, 0);
    const share = overview.current.gmv > 0 ? (top5 / overview.current.gmv) * 100 : 0;
    if (share > 60) {
      list.push(`As 5 lojas que mais vendem somam ${Math.round(share)}% do vendido. Depender de poucas lojas é um risco.`);
    }
    list.push(`Loja que mais vendeu: ${top.name || 'Loja'}, com ${brl(top.revenue)}.`);
  }

  return list;
}
