/** Resposta de GET/PUT /admin/switches (switchesView, src/routes/admin.ts:850). Freios + configurações do modo SaaS. */
export type SettlementMode = 'custodia' | 'direto';
export type BrakeKey = 'rankingPrizesEnabled' | 'benefitsRedeemEnabled' | 'gamificationPointsEnabled';

export interface SwitchesState extends Record<BrakeKey, boolean> {
  settlementMode: SettlementMode;
  saasMonthlyFee?: number;
  saasTrialDays?: number;
  saasGraceDays?: number;
  directTransfersEnabled?: boolean;
  /** Só na resposta da troca para custódia quando alguma assinatura não foi cancelada no Asaas. */
  saasBillingWarnings?: Array<{ storeId: string; error: string }>;
}
