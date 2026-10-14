import { haversineKm, parseCoords, type LatLng } from '../../../lib/geo';
import { splitAddressLines } from '../../../lib/address';
import { shortOrderCode } from '../../../lib/customerOrder';
import { formatMoney } from '../../../lib/money';

/** Estimativa mostrada na oferta: a mesma do card antigo (DeliveryOfferCard), 80% da taxa.
 *  O valor que vale é o do servidor (repasse ou Pix), mostrado na conclusão. */
export const OFFER_SHARE = 0.8;
const MOTO_AVG_KMH = 20; // mesma média urbana do card antigo
const minutes = (km: number) => Math.max(1, Math.round((km / MOTO_AVG_KMH) * 60));

export const fmtKm = (km: number) => `${km.toFixed(1).replace('.', ',')} km`;

export function offerView(d: any, self: LatLng | null) {
  const store = parseCoords(d?.storeLatitude, d?.storeLongitude);
  const customer = parseCoords(d?.customerLatitude, d?.customerLongitude);
  const legKm = typeof d?.distance === 'number' && d.distance > 0 ? d.distance : (store && customer ? haversineKm(store, customer) : null);
  const toStoreKm = self && store ? haversineKm(self, store) : null;
  const totalKm = legKm != null || toStoreKm != null ? (toStoreKm || 0) + (legKm || 0) : null;
  const drop = splitAddressLines(d?.customerAddress || d?.destination);
  return {
    earn: (Number(d?.fee) || 0) * OFFER_SHARE,
    code: shortOrderCode(String(d?.orderId || d?._id || '')),
    store,
    customer,
    pickup: { ...splitAddressLines(d?.storeAddress || d?.pickupLocation), km: toStoreKm, min: toStoreKm != null ? minutes(toStoreKm) : null },
    drop: { ...drop, area: drop.line2.split(',')[0].trim(), km: legKm, min: legKm != null ? minutes(legKm) : null },
    totalKm,
    totalMin: totalKm != null && totalKm > 0 ? minutes(totalKm) : null,
  };
}

/** "R. dos Pinheiros, 870 → Vila Madalena · R$ 9,60" (texto da oferta perdida). */
export function offerSummary(d: any): string {
  const v = offerView(d, null);
  const from = v.pickup.line1 || 'Loja';
  const to = v.drop.area || v.drop.line1 || 'cliente';
  return `${from} → ${to} · ${formatMoney(v.earn)}`;
}
