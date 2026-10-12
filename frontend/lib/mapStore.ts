import { imageUrl } from './config';
import type { StoreCardData } from '../components/drop/StoreCard';
import type { DeliveryQuote } from '../types/delivery';
import { openStatus } from './storeHours';

/** Loja → StoreCardData. Com cotação, aberta/fechada, prazo, frete e área vêm dela (nunca inventados). */
export function mapStore(store: any, quote?: DeliveryQuote | null): StoreCardData {
  const hours = openStatus(store);
  const base: StoreCardData = {
    name: store.name,
    imageUrl: imageUrl(store.featuredBannerUrl || store.coverBannerUrl, { w: 1000 }) || undefined,
    status: (hours.pausedBackAt ? false : quote ? quote.open : hours.open) ? 'aberta' : 'fechada',
    category:
      [store.neighborhood, store.city].filter(Boolean).join(' • ') ||
      store.address ||
      'Endereço não informado',
    rating: typeof store.ratingAverage === 'number' ? { average: store.ratingAverage, count: Number(store.ratingCount) || 0 } : undefined,
    closesAt: hours.closesAt ?? undefined,
    vitrine: Number(store.plan) === 1 || undefined,
  };
  if (hours.pausedBackAt) return { ...base, pausedBackAt: hours.pausedBackAt };
  if (!quote) return hours.open ? base : { ...base, opensAt: hours.opensAt ?? undefined };
  if (quote.inArea === false && quote.reason !== 'STORE_NO_LOCATION') return { ...base, outOfArea: true };
  if (quote.inArea !== true) return base;
  if (quote.open === false) return { ...base, opensAt: quote.opensAt, distanceKm: quote.distanceKm ?? undefined };
  const free = quote.freeDelivery || quote.fee === 0;
  return {
    ...base,
    etaMin: quote.etaMinutes ?? undefined,
    fee: !free && typeof quote.fee === 'number' ? quote.fee : undefined,
    freeDelivery: free || undefined,
    distanceKm: quote.distanceKm ?? undefined,
  };
}
