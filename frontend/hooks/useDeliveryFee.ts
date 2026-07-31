import { useMemo } from 'react';
import { PlatformFeeConfig } from '../types/checkout';

interface Params {
  distanceKm: number;
  config: PlatformFeeConfig | null;
  isPlan1: boolean;
}

export function useDeliveryFee({ distanceKm, config, isPlan1 }: Params): { deliveryFee: number } {
  const deliveryFee = useMemo(() => {
    if (isPlan1 || !config || !distanceKm || distanceKm < 0.1) return 0;
    return config.base + Math.max(0, distanceKm) * config.perKm;
  }, [distanceKm, config, isPlan1]);
  return { deliveryFee };
}
