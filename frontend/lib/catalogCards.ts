import { imageUrl } from './config';
import type { DeliveryQuote } from '../types/delivery';
import type { ProductCardData } from '../components/drop/ProductCard';

/** Produto da API (catálogo, busca, ofertas) + cotação da loja → dados do ProductCard. */
export function productCardData(p: any, quote?: DeliveryQuote | null, opts: { storeName?: string } = {}): ProductCardData {
  const price = Number(p?.price) || 0;
  const old = Number(p?.oldPrice);
  const oldPrice = Number.isFinite(old) && old > price ? old : undefined;
  const discountPercent = oldPrice ? Math.round((1 - price / oldPrice) * 100) : undefined;
  const inArea = quote?.inArea === true;
  return {
    name: p?.name || 'Produto',
    store: opts.storeName ?? p?.storeName ?? undefined,
    imageUrl: imageUrl(p?.image || p?.images?.[0], { w: 600 }) || undefined,
    price, oldPrice, discountPercent,
    stock: p?.quantity != null ? Number(p.quantity) : undefined,
    etaMinutes: inArea && quote?.open !== false && quote?.etaMinutes ? quote.etaMinutes[1] : undefined,
    freeDelivery: inArea && quote!.open !== false && (quote!.freeDelivery || quote!.fee === 0),
    outOfArea: quote?.inArea === false && quote.reason !== 'STORE_NO_LOCATION',
  };
}
