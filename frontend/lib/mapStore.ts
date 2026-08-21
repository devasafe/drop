import { imageUrl } from './config';
import type { StoreCardData } from '../components/drop/StoreCard';

/** Loja → StoreCardData. Sem rating/eta/frete reais no backend hoje; ficam de
 * fora. `category` reaproveita bairro/cidade/endereço reais da loja. */
export function mapStore(store: any): StoreCardData {
  return {
    name: store.name,
    imageUrl: imageUrl(store.featuredBannerUrl || store.coverBannerUrl, { w: 1000 }) || undefined,
    status: store.isOpen ? 'aberta' : 'fechada',
    category:
      [store.neighborhood, store.city].filter(Boolean).join(' • ') ||
      store.address ||
      'Endereço não informado',
  };
}
