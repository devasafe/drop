import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { ChevronDown, Clock, SearchX, SlidersHorizontal, Store as StoreIcon } from 'lucide-react';
import { SearchField } from '../components/ui/SearchField';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { Chip } from '../components/ui/Chip';
import { Tabs, tabPanelProps } from '../components/ui/Tabs';
import { ProductCard } from '../components/drop/ProductCard';
import { StoreCard } from '../components/drop/StoreCard';
import { DeliveryBadge } from '../components/drop/DeliveryBadge';
import { SearchSuggestions } from '../components/drop/SearchSuggestions';
import { DeliveryAddressControl } from '../components/drop/DeliveryAddressControl';
import { SearchFiltersSheet, activeFilterCount, type SearchFiltersValue } from '../components/drop/SearchFiltersSheet';
import { useDeliveryAddress } from '../hooks/useDeliveryAddress';
import { useAddressPicker } from '../hooks/useAddressPicker';
import { useSearchSuggest } from '../hooks/useSearchSuggest';
import { useSearch } from '../hooks/useSearch';
import { useAllProducts } from '../hooks/useAllProducts';
import { Pagination } from '../components/ui/Pagination';
import { useStoreQuotes } from '../hooks/useStoreQuotes';
import { useAddToCart } from '../hooks/useAddToCart';
import { useStores } from '../hooks/useSync';
import { useNearbyStores } from '../hooks/useCatalogHome';
import { productCardData } from '../lib/catalogCards';
import { mapStore } from '../lib/mapStore';
import { deliveryStates } from '../lib/deliveryView';
import { effectiveFilters, soldOutLast, SORT_LABEL } from '../lib/searchFilters';
import { addRecentSearch, clearRecentSearches, getRecentSearches } from '../lib/recentSearches';
import { buscarHref, categoriaHref, lojaHref, produtoHref, type BuscarTab } from '../lib/routes';
import type { SearchQuery, SearchType } from '../types/search';
import styles from './Buscar.module.css';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const PROD_DEFAULT: SearchFiltersValue = { sort: 'relevance', openNow: false };
const STORE_DEFAULT: SearchFiltersValue = { sort: 'relevance', openNow: true };

/** Todas as lojas, sem endereço. Isolado para só buscar /stores quando a lista é mostrada. */
function AllStores({ onOpen }: { onOpen: (id: string) => void }) {
  const { stores, loading } = useStores();
  if (loading) return <div className={styles.list} role="status" aria-label="Carregando lojas"><Skeleton height={64} /><Skeleton height={64} /><Skeleton height={64} /></div>;
  if (stores.length === 0) return <EmptyState icon={<StoreIcon />} title="Nenhuma loja por aqui ainda" />;
  return <div className={styles.list}>{stores.map((s: any) => <StoreCard key={s._id} variant="resultado" store={mapStore(s)} onClick={() => onOpen(s._id)} />)}</div>;
}

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
  const [prodFilters, setProdFilters] = useState<SearchFiltersValue>(PROD_DEFAULT);
  const [storeFilters, setStoreFilters] = useState<SearchFiltersValue>(STORE_DEFAULT);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filters = tab === 'lojas' ? storeFilters : prodFilters;
  const setFilters = tab === 'lojas' ? setStoreFilters : setProdFilters;
  const type: SearchType = tab === 'lojas' ? 'stores' : 'products';
  // Sem endereço não há "abertas agora" nem "mais perto": o filtro não vale (e a contagem não o conta).
  const effective = effectiveFilters(filters, !!address.point);
  const filterCount = activeFilterCount(effective, type);

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
    ? { q, type, point: address.point, filters: { ...effective, categoryName: categoria } }
    : null;
  const results = useSearch(editing ? null : query);
  const nearby = useNearbyStores(address.point, 12, { enabled: initial && tab === 'lojas' });
  const pageParam = Math.max(1, Math.floor(Number(str(router.query.page))) || 1);
  const allProducts = useAllProducts(pageParam, { enabled: initial && tab === 'produtos' });
  const listRef = useRef<HTMLDivElement>(null);
  const pageChanged = useRef(false);
  const storeIds = useMemo(() => [
    ...(suggest.data?.products ?? []).map((p) => p.storeId),
    ...(initial && tab === 'produtos' ? allProducts.products.map((p: any) => p.storeId) : []),
    ...results.items.map((p: any) => (type === 'stores' ? p._id : p.storeId)),
  ].filter(Boolean), [suggest.data, results.items, allProducts.products, initial, tab, type]);
  // Página além do fim (ex.: ?page=999): leva para a última válida.
  useEffect(() => {
    if (allProducts.loading || allProducts.failed || allProducts.pages < 1 || pageParam <= allProducts.pages) return;
    router.replace(buscarHref({ page: allProducts.pages }));
  }, [allProducts.loading, allProducts.failed, allProducts.pages, pageParam]); // eslint-disable-line react-hooks/exhaustive-deps
  // Trocou de página: volta ao topo da lista.
  useEffect(() => {
    if (!pageChanged.current) { pageChanged.current = true; return; }
    listRef.current?.scrollIntoView?.({ block: 'start' });
  }, [pageParam]);
  const { quotes } = useStoreQuotes(storeIds, address.point);
  const noAddress = deliveryStates({ hasPoint: !!address.point, address: address.label, onSetAddress: picker.request, onChangeAddress: picker.request });

  const submit = (term: string, extra: { categoria?: string } = {}) => {
    const t = term.trim();
    if (t.length < 2) return;
    setRecent(addRecentSearch(t));
    router.push(buscarHref({ q: t, ...(tab !== 'produtos' ? { tab } : {}), ...extra }));
  };
  const remember = () => setRecent(addRecentSearch(input));
  const openStore = (id: string) => router.push(lojaHref(id));
  const limpar = () => {
    setFilters({ sort: 'relevance', openNow: false });
    if (categoria) router.replace(buscarHref({ q: q || undefined, tab }));
  };
  const add = (p: any) => addToCart({ productId: p._id, quantity: 1, name: p.name, price: Number(p.price), storeId: p.storeId, storeName: p.storeName, image: p.image });
  const productList = (items: any[]) => soldOutLast(items).map((p: any) => (
    <div key={p._id} className={styles.item}>
      <a href={produtoHref(p._id)} className={styles.itemLink} aria-label={p.name}
        onClick={(e) => { e.preventDefault(); router.push(produtoHref(p._id)); }} />
      <ProductCard variant="grade" product={productCardData(p, quotes[p.storeId])} onAdd={() => add(p)} />
    </div>
  ));

  const recentSection = recent.length > 0 && (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Buscas recentes</h2>
        <button type="button" className={styles.sectionLink} onClick={() => { clearRecentSearches(); setRecent([]); }}>Limpar</button>
      </div>
      <div className={styles.recent}>
        {recent.map((r) => <button key={r} type="button" className={styles.recentChip} onClick={() => submit(r)}><Clock size={14} aria-hidden="true" />{r}</button>)}
      </div>
    </section>
  );

  const storeSkeleton = <div className={styles.list} role="status" aria-label="Carregando lojas"><Skeleton height={64} /><Skeleton height={64} /><Skeleton height={64} /></div>;
  const initialBody = tab === 'lojas' ? (
    <section className={styles.section}>
      {address.point
        ? nearby.stores.length > 0 && <p className={styles.resultsMeta}>{`${nearby.stores.length} ${nearby.stores.length === 1 ? 'loja entrega' : 'lojas entregam'} em ${address.label} · mais perto primeiro`}</p>
        : <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>Lojas</h2></div>}
      {!address.point && noAddress.map((st, i) => <DeliveryBadge key={i} state={st} />)}
      {!address.point ? <AllStores onOpen={openStore} />
        : nearby.loading ? storeSkeleton
        : nearby.failed ? <EmptyState variant="error" icon={<StoreIcon />} title="Não carregamos as lojas" description="Confira sua conexão." onRetry={nearby.retry} />
        : nearby.stores.length === 0 ? <EmptyState icon={<StoreIcon />} title="Nenhuma loja entrega aqui ainda" description="Tente outro endereço." />
        : <div className={styles.list}>{[...nearby.stores.filter((st: any) => st.quote?.open !== false), ...nearby.stores.filter((st: any) => st.quote?.open === false)].map((st: any) => <StoreCard key={st._id} variant="resultado" store={mapStore(st, st.quote)} onClick={() => openStore(st._id)} />)}</div>}
    </section>
  ) : (
    <section className={styles.section}>
      <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>Todos os produtos</h2></div>
      <div ref={listRef} />
      {allProducts.failed ? <EmptyState variant="error" icon={<SearchX />} title="Não carregamos os produtos" description="Confira sua conexão." onRetry={allProducts.retry} />
        : allProducts.loading || (allProducts.pages > 0 && pageParam > allProducts.pages) ? <div className={styles.list} role="status" aria-label="Carregando produtos"><Skeleton height={88} /><Skeleton height={88} /><Skeleton height={88} /></div>
        : allProducts.products.length === 0 ? <EmptyState icon={<SearchX />} title="Nenhum produto por aqui ainda" />
        : (
          <>
            <div className={styles.grid}>{productList(allProducts.products)}</div>
            <Pagination page={pageParam} pages={allProducts.pages} label="Páginas de produtos"
              onChange={(n) => router.push(buscarHref({ page: n }))} />
          </>
        )}
    </section>
  );

  const filtered = filterCount > 0 || !!categoria;
  const resultsBody = !ready ? null : results.loading ? (
    <div className={styles.list} role="status" aria-label="Carregando resultados"><Skeleton height={88} /><Skeleton height={88} /><Skeleton height={88} /></div>
  ) : results.failed ? (
    <EmptyState variant="error" icon={<SearchX />} title="Não conseguimos buscar agora" description="Confira sua conexão." onRetry={results.retry} />
  ) : results.items.length === 0 ? (
    filtered
      ? <EmptyState icon={<SearchX />} title="Nenhum resultado com esses filtros." action={<Button variant="secondary" onClick={limpar}>Limpar filtros</Button>} />
      : <EmptyState icon={<SearchX />} title={`Nada encontrado para "${q}"`} description="Confira a ortografia ou tente um termo mais curto." />
  ) : (
    <section className={type === 'stores' ? styles.list : styles.results} aria-label={`Resultados para ${q}`}>
      <p className={styles.srOnly} aria-live="polite">{`${results.items.length}${results.hasMore ? '+' : ''} resultados para ${q}`}</p>
      {type === 'stores'
        ? results.items.map((st: any) => <StoreCard key={st._id} variant="resultado" store={mapStore(st, quotes[st._id])} onClick={() => openStore(st._id)} />)
        : (
          <>
            <div className={styles.resultsMeta}>
              <span>{address.point ? `Produtos que entregam em ${address.label}` : 'Produtos'}</span>
              <button type="button" className={styles.sortButton} onClick={() => setFiltersOpen(true)}>
                {SORT_LABEL[effective.sort]} <ChevronDown size={16} aria-hidden="true" />
              </button>
            </div>
            <div className={styles.grid}>{productList(results.items)}</div>
          </>
        )}
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
  );

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
          onCategory={(c) => { remember(); router.push(categoriaHref(c)); }}
          onSearch={(t) => submit(t)} />
      ) : (
        <>
          <div className={styles.tabs}>
            <Tabs label="Resultados" idPrefix="busca" value={tab}
              items={[{ id: 'produtos', label: 'Produtos' }, { id: 'lojas', label: 'Lojas' }]}
              onChange={(id) => router.replace(buscarHref({ q: q || undefined, tab: id as BuscarTab, categoria }))} />
          </div>
          <div {...tabPanelProps(tab, 'busca')} className={styles.panel}>
            {!initial && ready && (
              <div className={styles.shortcuts}>
                {tab === 'produtos' ? (
                  <>
                    <Chip label="Até R$ 50" active={filters.maxPrice === 50} onClick={() => setFilters((f) => ({ ...f, maxPrice: f.maxPrice === 50 ? undefined : 50 }))} />
                    <Chip label="Menor preço" active={filters.sort === 'price_asc'} onClick={() => setFilters((f) => ({ ...f, sort: f.sort === 'price_asc' ? 'relevance' : 'price_asc' }))} />
                  </>
                ) : (
                  <>
                    <Chip label="Abertas agora" active={effective.openNow} disabled={!address.point} onClick={() => setFilters((f) => ({ ...f, openNow: !f.openNow }))} />
                    <Chip label="Mais perto" active={filters.sort === 'distance'} disabled={!address.point} onClick={() => setFilters((f) => ({ ...f, sort: f.sort === 'distance' ? 'relevance' : 'distance' }))} />
                  </>
                )}
                <button type="button" className={styles.filtersButton} onClick={() => setFiltersOpen(true)}>
                  <SlidersHorizontal size={16} strokeWidth={1.75} aria-hidden="true" />
                  {filterCount > 0 ? `Filtros · ${filterCount}` : 'Filtros'}
                </button>
              </div>
            )}
            {initial ? <>{recentSection}{initialBody}</> : resultsBody}
          </div>
        </>
      )}

      <SearchFiltersSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} type={type} value={effective} hasPoint={!!address.point}
        onApply={(v) => { setFilters(v); setFiltersOpen(false); }} />
    </div>
  );
}
