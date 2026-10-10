import { imageUrl } from './config';
import type { StoreCardData } from '../components/drop/StoreCard';
import type { DeliveryQuote } from '../types/delivery';

/** Loja → StoreCardData. Com cotação, aberta/fechada, prazo, frete e área vêm dela (nunca inventados). */
export function mapStore(store: any, quote?: DeliveryQuote | null): StoreCardData {
  const base: StoreCardData = {
    name: store.name,
    imageUrl: imageUrl(store.featuredBannerUrl || store.coverBannerUrl, { w: 1000 }) || undefined,
    status: (quote ? quote.open : store.isOpen) ? 'aberta' : 'fechada',
    category:
      [store.neighborhood, store.city].filter(Boolean).join(' • ') ||
      store.address ||
      'Endereço não informado',
  };
  if (!quote) return base;
  if (quote.inArea === false && quote.reason !== 'STORE_NO_LOCATION') return { ...base, outOfArea: true };
  if (quote.inArea !== true) return base;
  const free = quote.freeDelivery || quote.fee === 0;
  return {
    ...base,
    etaMin: quote.etaMinutes ?? undefined,
    fee: !free && typeof quote.fee === 'number' ? quote.fee : undefined,
    freeDelivery: free || undefined,
    opensAt: quote.open === false ? quote.opensAt : undefined,
    distanceKm: quote.distanceKm ?? undefined,
  };
}
