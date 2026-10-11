import { useEffect, useState } from 'react';
import api from '../lib/api';

export interface CardFeeConfig { cardFeePercent: number; cardFeeFixed: number; cardAnticipationMonthlyRate: number; cardInstallmentMaxCount: number; cardInstallmentMinValue: number }
/** Mesmos fallbacks do useCheckout (defaults do schema Prisma). O servidor recalcula a cobrança. */
export const CARD_FEE_DEFAULTS: CardFeeConfig = { cardFeePercent: 2.99, cardFeeFixed: 0.49, cardAnticipationMonthlyRate: 1.99, cardInstallmentMaxCount: 12, cardInstallmentMinValue: 5 };

let cached: CardFeeConfig | null = null;
export function __resetCardFeeConfigCache() { cached = null; }

/** Taxas do cartão (GET /settings/platform-config, público) para mostrar o parcelamento. Cache em módulo. */
export function useCardFeeConfig(): CardFeeConfig | null {
  const [cfg, setCfg] = useState<CardFeeConfig | null>(cached);
  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    api.get<Partial<CardFeeConfig>>('/settings/platform-config')
      .then((r) => { cached = { ...CARD_FEE_DEFAULTS, ...Object.fromEntries(Object.entries(r.data || {}).filter(([k, v]) => k in CARD_FEE_DEFAULTS && v != null).map(([k, v]) => [k, Number(v)])) } as CardFeeConfig; })
      .catch(() => { cached = CARD_FEE_DEFAULTS; })
      .finally(() => { if (!cancelled) setCfg(cached); });
    return () => { cancelled = true; };
  }, []);
  return cfg;
}
