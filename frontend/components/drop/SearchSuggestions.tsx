import { ImageOff, Search, Store } from 'lucide-react';
import { formatMoney } from '../../lib/money';
import { imageUrl } from '../../lib/config';
import { Chip } from '../ui/Chip';
import { Skeleton } from '../ui/Skeleton';
import type { Suggestions } from '../../types/search';
import type { DeliveryQuote } from '../../types/delivery';
import styles from './SearchSuggestions.module.css';

export interface SearchSuggestionsProps {
  term: string; data: Suggestions | null; loading: boolean; quotes: Record<string, DeliveryQuote>;
  onProduct: (id: string) => void; onStore: (id: string) => void; onCategory: (name: string) => void; onSearch: (term: string) => void; id?: string;
}

function deliveryText(q?: DeliveryQuote): string | null {
  if (!q || q.inArea !== true || q.open === false) return null;
  if (q.etaMinutes) return `~${q.etaMinutes[1]} min`;
  return q.freeDelivery || q.fee === 0 ? 'Frete grátis' : null;
}

/** Sugestões enquanto digita (spec §7.1): produtos com foto, preço e prazo; lojas; categorias. */
export function SearchSuggestions({ term, data, loading, quotes, onProduct, onStore, onCategory, onSearch, id }: SearchSuggestionsProps) {
  if (loading && !data) {
    return (
      <div id={id} className={styles.box} role="status" aria-label="Carregando sugestões">
        <Skeleton height={48} /><Skeleton height={48} /><Skeleton height={48} />
      </div>
    );
  }
  const empty = !!data && data.products.length === 0 && data.stores.length === 0 && data.categories.length === 0;
  return (
    <div id={id} className={styles.box}>
      {empty && <p className={styles.empty}>Nada com "{term}". Tente um termo mais curto.</p>}
      {data?.products.map((p) => (
        <button key={p.id} type="button" className={styles.row} onClick={() => onProduct(p.id)}>
          <span className={styles.thumb}>{p.image ? <img src={imageUrl(p.image, { w: 96 })} alt="" /> : <ImageOff size={18} aria-hidden="true" />}</span>
          <span className={styles.name}>{p.name}</span>
          <span className={styles.side}>
            <span className={styles.price}>{formatMoney(p.price)}</span>
            {deliveryText(quotes[p.storeId]) && <span className={styles.eta}>{deliveryText(quotes[p.storeId])}</span>}
          </span>
        </button>
      ))}
      {data?.stores.map((s) => (
        <button key={s.id} type="button" className={styles.row} onClick={() => onStore(s.id)}>
          <span className={styles.thumb}><Store size={18} aria-hidden="true" /></span>
          <span className={styles.name}>{s.name}</span>
          <span className={styles.meta}>Loja</span>
        </button>
      ))}
      {!!data?.categories.length && (
        <div className={styles.chips}>{data.categories.map((c) => <Chip key={c} label={c} onClick={() => onCategory(c)} />)}</div>
      )}
      <button type="button" className={styles.searchRow} onClick={() => onSearch(term)}>
        <Search size={18} aria-hidden="true" /> {`Buscar "${term}"`}
      </button>
    </div>
  );
}
