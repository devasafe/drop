/**
 * Simulação de um pedido na tela Regras e taxas (D3a, tela 22), com a fórmula de hoje do servidor
 * (src/utils/walletCalculations.ts):
 * - taxa de entrega = (motoboyCutPerDelivery || 5) + (motoboyCutPerKm || 1) × km  (calculateDeliveryFeeWithConfig);
 * - plano 1 (vitrine) não tem entrega;
 * - loja = produtos × (1 − comissão do plano); DROP = comissão do plano + (motoboyCommissionPercent || 20)% da entrega;
 * - motoboy = entrega − a parte do DROP (calculateOrderDistribution). Tudo arredondado a centavos.
 * É o modo App (custódia); o custo do cartão não entra.
 */
export interface SimulationConfig {
  commissionPlan1?: number;
  commissionPlan2?: number;
  commissionPlan3?: number;
  motoboyCutPerDelivery?: number;
  motoboyCutPerKm?: number;
  motoboyCommissionPercent?: number;
}

export interface SimulationInput { productTotal: number; distanceKm: number; plan: 1 | 2 | 3 }

export interface SimulationResult {
  deliveryFee: number;
  clientPays: number;
  storeReceives: number;
  storeCommissionPercent: number;
  motoboyReceives: number;
  motoboySharePercent: number;
  dropKeeps: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function simulateOrder(cfg: SimulationConfig, input: SimulationInput): SimulationResult {
  const planKey = `commissionPlan${input.plan}` as const;
  const pct = Number(cfg[planKey]) || 0;
  const base = cfg.motoboyCutPerDelivery || 5;
  const perKm = cfg.motoboyCutPerKm || 1;
  const motoboyCommission = cfg.motoboyCommissionPercent || 20;

  const fee = input.plan === 1 ? 0 : round2(base + perKm * Math.max(0, input.distanceKm));
  const storeReceives = round2(input.productTotal * (1 - pct / 100));
  const appProduct = round2(input.productTotal * (pct / 100));
  const motoboyReceives = round2(fee * (1 - motoboyCommission / 100));
  const appDelivery = round2(fee * (motoboyCommission / 100));

  return {
    deliveryFee: fee,
    clientPays: round2(input.productTotal + fee),
    storeReceives,
    storeCommissionPercent: pct,
    motoboyReceives,
    motoboySharePercent: 100 - motoboyCommission,
    dropKeeps: round2(appProduct + appDelivery),
  };
}
