/** Percentuais das taxas de cancelamento, com os padrões de sempre quando a config não tem o campo. */
export interface CancelFeeConfig {
  cancelFeeCustomerPercent: number;
  cancelFeeStorePercent: number;
  cancelFeeMotoboyPercent: number;
  lateCancellationMotoboyShare: number;
}

export function cancelFeeConfigOf(cfg: any): CancelFeeConfig {
  return {
    cancelFeeCustomerPercent: cfg?.cancelFeeCustomerPercent ?? 10,
    cancelFeeStorePercent: cfg?.cancelFeeStorePercent ?? 10,
    cancelFeeMotoboyPercent: cfg?.cancelFeeMotoboyPercent ?? 10,
    lateCancellationMotoboyShare: cfg?.lateCancellationMotoboyShare ?? 50,
  };
}
