import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Tag, LayoutGrid } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useStores, useProducts } from '../hooks/useSync';
import { mapStore } from '../lib/mapStore';
import { filterStores, filterProducts, productCategories, mapProductCard } from '../lib/searchCatalog';
import { SearchField } from '../components/ui/SearchField';
import { CategoryRail } from '../components/drop/CategoryRail';
import { StoreCard } from '../components/drop/StoreCard';
import { ProductCard } from '../components/drop/ProductCard';
import styles from './Buscar.module.css';

/** Buscar (/) — busca unificada de lojas + produtos no design system. */
export default function BuscarPage() {
  const router = useRouter();
  const { add } = useCart();
  const { stores, loading: storesLoading } = useStores();
  const { products, loading: productsLoading } = useProducts();

  const initialQ = typeof router.query.q === 'string' ? router.query.q : '';
  const [query, setQuery] = useState(initialQ);
  const [category, setCategory] = useState('all');
  useEffect(() => {
    if (typeof router.query.q === 'string') setQuery(router.query.q);
  }, [router.query.q]);

  const storeName = useMemo(() => {
    const m = new Map<string, string>();
    (stores || []).forEach((s: any) => m.set(s._id, s.name));
    return m;
  }, [stores]);

  const foundStores = useMemo(() => filterStores(stores, query), [stores, query]);
  const foundProducts = useMemo(
    () => filterProducts(products, query, category === 'all' ? undefined : category),
    [products, query, category],
  );

  const categories = useMemo(() => {
    const base = productCategories(products).map((c) => ({ id: c.id, label: c.label, icon: <Tag size={15} /> }));
    return [{ id: 'all', label: 'Tudo', icon: <LayoutGrid size={15} /> }, ...base];
  }, [products]);

  const loading = storesLoading || productsLoading;
  const nothing = !loading && foundStores.length === 0 && foundProducts.length === 0;

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <SearchField value={query} onChange={setQuery} placeholder="Buscar lojas e produtos…" />
      </div>

      {categories.length > 1 && (
        <div className={styles.rail}>
          <CategoryRail categories={categories} activeId={category} onSelect={setCategory} />
        </div>
      )}

      {loading ? (
        <div className={styles.section}><p className={styles.muted}>Carregando…</p></div>
      ) : nothing ? (
        <div className={styles.empty}>
          {query ? `Nada encontrado para “${query}”.` : 'Nenhuma loja ou produto disponível.'}
        </div>
      ) : (
        <>
          {foundStores.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Lojas</h2>
              <div className={styles.storeList}>
                {foundStores.map((s: any) => (
                  <StoreCard
                    key={s._id}
                    variant="resultado"
                    store={mapStore(s)}
                    onClick={() => router.push(`/stores/${s._id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {foundProducts.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Produtos</h2>
              <div className={styles.productList}>
                {foundProducts.map((p: any) => (
                  <div key={p._id} className={styles.productItem} onClick={() => router.push(`/product/${p._id}`)}>
                    <ProductCard
                      variant="busca"
                      product={mapProductCard(p, storeName.get(p.storeId))}
                      soldOut={Number(p.quantity) <= 0}
                      onAdd={(e?: any) => {
                        e?.stopPropagation?.();
                        add({ productId: p._id, quantity: 1, name: p.name, price: Number(p.price), storeId: p.storeId });
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
