import { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { ChevronDown, LayoutGrid, Search } from 'lucide-react';
import { useDeliveryAddress } from '../../hooks/useDeliveryAddress';
import { useSearch } from '../../hooks/useSearch';
import { useCategorySummary } from '../../hooks/useCategorySummary';
import { useStoreQuotes } from '../../hooks/useStoreQuotes';
import { useAddToCart } from '../../hooks/useAddToCart';
import { productCardData } from '../../lib/catalogCards';
import { SORT_LABEL, effectiveFilters, soldOutLast } from '../../lib/searchFilters';
import { buscarHref, produtoHref } from '../../lib/routes';
import { ScreenHeader } from '../../components/drop/ScreenHeader';
import { ProductCard } from '../../components/drop/ProductCard';
import { SearchFiltersSheet, type SearchFiltersValue } from '../../components/drop/SearchFiltersSheet';
import { Chip } from '../../components/ui/Chip';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import styles from './Categoria.module.css';

const str = (v: unknown) => (Array.isArray(v) ? v[0] : typeof v === 'string' ? v : '');

export default function CategoriaPage() {
  const router = useRouter();
  const nome = str(router.query.nome);
  const address = useDeliveryAddress();
  const addToCart = useAddToCart();
  const summary = useCategorySummary(nome || null);
  const [sub, setSub] = useState<string | null>(null);
  const [filters, setFilters] = useState<SearchFiltersValue>({ sort: 'relevance', openNow: false });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const effective = effectiveFilters(filters, !!address.point);
  const results = useSearch(nome ? { q: '', type: 'products', point: address.point, filters: { ...effective, categoryName: nome, subCategory: sub ?? undefined } } : null);
  const storeIds = useMemo(() => results.items.map((p: any) => p.storeId).filter(Boolean), [results.items]);
  const { quotes } = useStoreQuotes(storeIds, address.point);
  const title = summary.data?.name || nome;
  const goSearch = () => router.push(buscarHref({ focus: true }));

  return (
    <main className={styles.page}>
      <ScreenHeader title={title} onBack={() => router.back()}
        end={<button type="button" className={styles.iconBtn} aria-label="Buscar" onClick={goSearch}><Search size={22} aria-hidden="true" /></button>} />
      {summary.data && summary.data.productCount > 0 && (
        <>
          <div className={styles.chips}>
            <Chip label={`Todos ${summary.data.productCount}`} active={!sub} onClick={() => setSub(null)} />
            {summary.data.subCategories.map((s) => <Chip key={s.name} label={`${s.name} ${s.count}`} active={sub === s.name} onClick={() => setSub(s.name)} />)}
          </div>
          <div className={styles.meta}>
            <span>{`${summary.data.productCount} ${summary.data.productCount === 1 ? 'produto' : 'produtos'} em ${summary.data.storeCount} ${summary.data.storeCount === 1 ? 'loja' : 'lojas'}`}</span>
            <button type="button" className={styles.sortButton} onClick={() => setFiltersOpen(true)}>{SORT_LABEL[effective.sort]} <ChevronDown size={16} aria-hidden="true" /></button>
          </div>
        </>
      )}
      {summary.failed || results.failed ? (
        <EmptyState variant="error" icon={<LayoutGrid />} title="Não carregamos a categoria" description="Confira sua conexão." onRetry={() => { summary.retry(); results.retry(); }} />
      ) : summary.loading || results.loading ? (
        <div className={styles.grid} role="status" aria-label="Carregando produtos"><Skeleton height={220} /><Skeleton height={220} /><Skeleton height={220} /><Skeleton height={220} /></div>
      ) : results.items.length === 0 ? (
        <EmptyState icon={<LayoutGrid />} title="Nada nesta categoria por enquanto" description="Tente buscar pelo nome do produto."
          action={<Button variant="secondary" onClick={goSearch}>Buscar produtos</Button>} />
      ) : (
        <section className={styles.grid} aria-label={`Produtos de ${title}`}>
          {soldOutLast(results.items).map((p: any) => (
            <div key={p._id} className={styles.item}>
              <a href={produtoHref(p._id)} className={styles.itemLink} aria-label={p.name} onClick={(e) => { e.preventDefault(); router.push(produtoHref(p._id)); }} />
              <ProductCard variant="grade" product={productCardData(p, quotes[p.storeId])}
                onAdd={() => addToCart({ productId: p._id, quantity: 1, name: p.name, price: Number(p.price), storeId: p.storeId, storeName: p.storeName, image: p.image })} />
            </div>
          ))}
          {results.hasMore && <Button variant="secondary" loading={results.loadingMore} onClick={results.loadMore}>Carregar mais</Button>}
        </section>
      )}
      <SearchFiltersSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} type="products" value={effective} hasPoint={!!address.point}
        onApply={(v) => { setFilters(v); setFiltersOpen(false); }} />
    </main>
  );
}
