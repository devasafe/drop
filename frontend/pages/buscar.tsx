import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { SearchX } from 'lucide-react';
import { SearchField } from '../components/ui/SearchField';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { ProductCard } from '../components/drop/ProductCard';
import { SearchSuggestions } from '../components/drop/SearchSuggestions';
import { DeliveryAddressControl } from '../components/drop/DeliveryAddressControl';
import { useDeliveryAddress } from '../hooks/useDeliveryAddress';
import { useAddressPicker } from '../hooks/useAddressPicker';
import { useSearchSuggest } from '../hooks/useSearchSuggest';
import { useSearch } from '../hooks/useSearch';
import { useStoreQuotes } from '../hooks/useStoreQuotes';
import { useAddToCart } from '../hooks/useAddToCart';
import { productCardData } from '../lib/catalogCards';
import { addRecentSearch, clearRecentSearches, getRecentSearches } from '../lib/recentSearches';
import { buscarHref, lojaHref, produtoHref, type BuscarTab } from '../lib/routes';
import type { SearchQuery } from '../types/search';
import styles from './Buscar.module.css';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export default function BuscarPage() {
  const router = useRouter();
  const q = str(router.query.q).trim();
  const categoria = str(router.query.categoria) || undefined;
  const tab: BuscarTab = router.query.tab === 'lojas' ? 'lojas' : 'produtos';
  const ready = router.isReady !== false;
  const focusDone = useRef(false);
  const topRef = useRef<HTMLElement>(null);
  const [input, setInput] = useState(q);
  const [recent, setRecent] = useState<string[]>([]);
  const address = useDeliveryAddress();
  const picker = useAddressPicker();
  const addToCart = useAddToCart();

  useEffect(() => { setInput(q); }, [q]);
  useEffect(() => { setRecent(getRecentSearches()); }, []);

  // Foco só depois de o router hidratar: antes disso `query` vem vazio e `?q=` pareceria "sem termo".
  useEffect(() => {
    if (!ready || focusDone.current) return;
    focusDone.current = true;
    if (!q || router.query.focus === '1') topRef.current?.querySelector('input')?.focus();
  }, [ready, q, router.query.focus]);

  const editing = input.trim() !== q;
  const typing = editing && input.trim().length >= 2;
  const initial = ready && (!q || (editing && !typing));
  const suggest = useSearchSuggest(typing ? input : '');
  const query: SearchQuery | null = q.length >= 2
    ? { q, type: 'products', point: address.point, filters: { sort: 'relevance', categoryName: categoria } }
    : null;
  const results = useSearch(editing ? null : query);
  const storeIds = useMemo(() => [
    ...(suggest.data?.products ?? []).map((p) => p.storeId),
    ...results.items.map((p: any) => p.storeId),
  ].filter(Boolean), [suggest.data, results.items]);
  const { quotes } = useStoreQuotes(storeIds, address.point);

  const submit = (term: string, extra: { categoria?: string } = {}) => {
    const t = term.trim();
    if (t.length < 2) return;
    setRecent(addRecentSearch(t));
    router.push(buscarHref({ q: t, ...(tab !== 'produtos' ? { tab } : {}), ...extra }));
  };
  const remember = () => setRecent(addRecentSearch(input));

  return (
    <div className={styles.page}>
      <header className={styles.top} ref={topRef}>
        <DeliveryAddressControl address={address} picker={picker} />
        <SearchField
          value={input}
          onChange={setInput}
          onSubmit={submit}
          placeholder="Buscar produtos e lojas"
          inputProps={{ 'aria-label': 'Buscar produtos e lojas', ...(typing ? { 'aria-controls': 'busca-sugestoes' } : {}) }}
        />
      </header>

      {typing ? (
        <SearchSuggestions id="busca-sugestoes" term={input.trim()} data={suggest.data} loading={suggest.loading} quotes={quotes}
          onProduct={(id) => { remember(); router.push(produtoHref(id)); }}
          onStore={(id) => { remember(); router.push(lojaHref(id)); }}
          onCategory={(c) => submit(input, { categoria: c })}
          onSearch={(t) => submit(t)} />
      ) : initial ? (
        recent.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Buscas recentes</h2>
              <button type="button" className={styles.sectionLink} onClick={() => { clearRecentSearches(); setRecent([]); }}>Limpar</button>
            </div>
            <div className={styles.recent}>
              {recent.map((r) => <button key={r} type="button" className={styles.recentItem} onClick={() => submit(r)}>{r}</button>)}
            </div>
          </section>
        )
      ) : !ready ? null : results.loading ? (
        <div className={styles.list} role="status" aria-label="Carregando resultados"><Skeleton height={88} /><Skeleton height={88} /><Skeleton height={88} /></div>
      ) : results.failed ? (
        <EmptyState variant="error" icon={<SearchX />} title="Não conseguimos buscar agora" description="Confira sua conexão." onRetry={results.retry} />
      ) : results.items.length === 0 ? (
        <EmptyState icon={<SearchX />} title={`Nada encontrado para "${q}"`} description="Confira a ortografia ou tente um termo mais curto." />
      ) : (
        <section className={styles.list} aria-label={`Resultados para ${q}`}>
          <p className={styles.srOnly} aria-live="polite">{`${results.items.length}${results.hasMore ? '+' : ''} resultados para ${q}`}</p>
          {results.items.map((p: any) => (
            <div key={p._id} className={styles.item}>
              <a href={produtoHref(p._id)} className={styles.itemLink} aria-label={p.name}
                onClick={(e) => { e.preventDefault(); router.push(produtoHref(p._id)); }} />
              <ProductCard variant="busca" product={productCardData(p, quotes[p.storeId])}
                onAdd={() => addToCart({ productId: p._id, quantity: 1, name: p.name, price: Number(p.price), storeId: p.storeId, storeName: p.storeName, image: p.image })} />
            </div>
          ))}
          {results.failedMore && (
            <p className={styles.moreError} role="alert">
              Não carregamos mais resultados.{' '}
              <button type="button" className={styles.sectionLink} onClick={results.loadMore}>Tentar de novo</button>
            </p>
          )}
          {results.hasMore && !results.failedMore && (
            <Button variant="secondary" loading={results.loadingMore} onClick={results.loadMore}>Carregar mais</Button>
          )}
        </section>
      )}
    </div>
  );
}
