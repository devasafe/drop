import type { DeliveryQuote } from '../types/delivery';
import type { DeliveryState } from '../components/drop/DeliveryBadge';

export interface DeliveryViewInput {
  quote?: DeliveryQuote | null; loading?: boolean; hasPoint: boolean; address: string;
  onSetAddress: () => void; onChangeAddress: () => void;
}

/** Cotação → linhas do DeliveryBadge. Nunca inventa: sem dado, sem linha. */
export function deliveryStates(i: DeliveryViewInput): DeliveryState[] {
  if (!i.hasPoint) return [{ kind: 'noAddress', onSetAddress: i.onSetAddress }];
  const q = i.quote;
  if (!q) return i.loading ? [{ kind: 'loading' }] : [];
  if (q.inArea === null) return [{ kind: 'noAddress', onSetAddress: i.onSetAddress }];
  if (q.reason === 'STORE_NO_LOCATION') return [];
  if (q.inArea === false) return [{ kind: 'outOfArea', address: i.address, onChangeAddress: i.onChangeAddress }];
  const out: DeliveryState[] = [];
  if (q.open === false) out.push({ kind: 'closed', opensAt: q.opensAt });
  else if (q.etaMinutes) out.push({ kind: 'fast', minutes: q.etaMinutes[1] });
  if (q.freeDelivery || q.fee === 0) out.push({ kind: 'free' });
  else if (typeof q.fee === 'number') out.push({ kind: 'fee', fee: q.fee });
  return out;
}

export const formatEtaRange = (eta: [number, number] | null | undefined): string | null => (eta ? `${eta[0]}–${eta[1]} min` : null);
