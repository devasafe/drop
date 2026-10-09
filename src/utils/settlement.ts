import { getPlatformConfig } from '../repositories/platformConfig.repository';

export type SettlementMode = 'custodia' | 'direto';

export async function getSaasConfig() {
  const c = await getPlatformConfig();
  return {
    settlementMode: (c?.settlementMode ?? 'custodia') as SettlementMode,
    billingModel: (c?.billingModel ?? 'mensalidade') as 'mensalidade' | 'comissao' | 'ambos',
    motoboyShareDirect: Number(c?.motoboyShareDirect ?? 100),
    directCardEnabled: !!c?.directCardEnabled,
    transferBlockHours: Number(c?.transferBlockHours ?? 24),
    directTransfersEnabled: !!c?.directTransfersEnabled,
    directTransferMaxAmount: Number(c?.directTransferMaxAmount ?? 150),
    directTransferDailyMaxPerStore: Number(c?.directTransferDailyMaxPerStore ?? 3000),
    saasMonthlyFee: Number(c?.saasMonthlyFee ?? 0),
    saasTrialDays: Number(c?.saasTrialDays ?? 14),
    saasGraceDays: Number(c?.saasGraceDays ?? 5),
  };
}

export async function isDirectMode(): Promise<boolean> {
  return (await getSaasConfig()).settlementMode === 'direto';
}

/**
 * Pedido cobrado na conta Asaas DA LOJA (modo direto, provider 'asaas_loja').
 * O dinheiro nunca passou pela custódia: nada de carteira, AppCashbox, Payout ou conta-mãe.
 */
export function isDirectOrder(order: { paymentProvider?: string | null } | null | undefined): boolean {
  return order?.paymentProvider === 'asaas_loja';
}
