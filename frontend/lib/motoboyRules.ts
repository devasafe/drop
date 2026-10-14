/**
 * D2 · regras de ganho do motoboy lidas do PlatformConfig (GET /settings/platform-config).
 * Fonte única do app (C4). Qualquer campo ausente ou estranho → null: a tela não mostra número presumido.
 * Os campos Decimal podem chegar como string ("10.00") ou número; `Number()` cobre os dois.
 */
export interface MotoboyRules {
  basePerDelivery: number;
  perKm: number;
  commissionPercent: number;
  minimumWithdraw: number;
  customerAbsentWaitMin: number;
  lateCancellationMotoboyShare: number;
  transferBlockHours: number;
  autoApprovePayouts: boolean;
  autoApproveWithdrawals: boolean;
  /** % da taxa que vai ao motoboy no modo direto (`motoboyShareDirect`). Ausente se a config não o trouxe ou veio inválido. */
  shareDirectPercent?: number;
}

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export function parseMotoboyRules(cfg: any): MotoboyRules | null {
  if (!cfg || typeof cfg !== 'object') return null;
  const base = num(cfg.motoboyCutPerDelivery);
  const perKm = num(cfg.motoboyCutPerKm);
  const commission = num(cfg.motoboyCommissionPercent);
  const r = {
    // Mesma regra de walletCalculations/finalizarEntrega no servidor: 0 vale o padrão (`|| 5`, `|| 1`, `|| 20`).
    basePerDelivery: Number.isNaN(base) ? NaN : base || 5,
    perKm: Number.isNaN(perKm) ? NaN : perKm || 1,
    commissionPercent: Number.isNaN(commission) ? NaN : commission || 20,
    minimumWithdraw: num(cfg.motoboyMinimumWithdraw),
    customerAbsentWaitMin: num(cfg.customerAbsentWaitMin),
    lateCancellationMotoboyShare: num(cfg.lateCancellationMotoboyShare),
    transferBlockHours: num(cfg.transferBlockHours),
  };
  if (Object.values(r).some((v) => Number.isNaN(v))) return null;
  if (r.commissionPercent > 100 || r.lateCancellationMotoboyShare > 100) return null;
  // Direto (K6): campo opcional; inválido não derruba as demais regras, só tira o número do direto.
  const direct = num(cfg.motoboyShareDirect);
  const shareDirect = !Number.isNaN(direct) && direct <= 100 ? { shareDirectPercent: direct } : {};
  return { ...r, autoApprovePayouts: cfg.autoApprovePayouts === true, autoApproveWithdrawals: cfg.autoApproveWithdrawals === true, ...shareDirect };
}

/**
 * Exemplo ilustrativo. Taxa = base + por km × km (como o servidor).
 * Custódia: o motoboy fica com (100 − comissão)%. Direto: com `motoboyShareDirect`%;
 * sem esse dado devolve null (a tela mostra só texto, sem número).
 */
export function exampleRide(
  r: MotoboyRules,
  km: number,
  mode: 'custodia' | 'direto' = 'custodia',
): { extra: number; fee: number; sharePercent: number; mine: number } | null {
  let sharePercent: number;
  if (mode === 'direto') {
    if (r.shareDirectPercent === undefined) return null;
    sharePercent = r.shareDirectPercent;
  } else {
    sharePercent = round2(100 - r.commissionPercent);
  }
  const extra = round2(r.perKm * km);
  const fee = round2(r.basePerDelivery + extra);
  return { extra, fee, sharePercent, mine: round2(fee * (sharePercent / 100)) };
}
