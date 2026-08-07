const round2 = (n: number) => Math.round(n * 100) / 100;

export interface InstallmentCfg { cardFeePercent: number; cardFeeFixed: number; cardAnticipationMonthlyRate: number; }
export interface InstallmentOption { count: number; installmentValue: number; total: number; }

export function computeCardTotal(base: number, count: number, cfg: InstallmentCfg): { total: number; installmentValue: number } {
  const pct = cfg.cardFeePercent / 100;
  const rate = cfg.cardAnticipationMonthlyRate / 100;
  const denom = 1 - pct - rate * (count + 1) / 2;
  if (denom <= 0) throw new Error('Configuração de parcelamento inválida (taxas somam ≥ 100%)');
  const total = round2((base + cfg.cardFeeFixed) / denom);
  const installmentValue = round2(total / count);
  return { total, installmentValue };
}

export function installmentOptions(
  base: number,
  cfg: InstallmentCfg & { cardInstallmentMaxCount: number; cardInstallmentMinValue: number },
): InstallmentOption[] {
  const out: InstallmentOption[] = [];
  for (let n = 1; n <= cfg.cardInstallmentMaxCount; n++) {
    let r; try { r = computeCardTotal(base, n, cfg); } catch { break; }
    if (r.installmentValue < cfg.cardInstallmentMinValue) continue; // parcela pequena demais: pula
    out.push({ count: n, installmentValue: r.installmentValue, total: r.total });
  }
  return out;
}
