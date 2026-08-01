import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Tag, LayoutGrid } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useStores, useProducts, useTopStores, useTopProducts, useAddresses } from '../hooks/useSync';
import { mapStore } from '../lib/mapStore';
import { filterStores, filterProducts, productCategories, mapProductCard } from '../lib/searchCatalog';
import { rankStores, rankPremiumProducts, take } from '../lib/catalogRanking';
import { parseCoords } from '../lib/geo';
import { SearchField } from '../components/ui/SearchField';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { CategoryRail } from '../components/drop/CategoryRail';
import { StoreCard } from '../components/drop/StoreCard';
import { ProductCard } from '../components/drop/ProductCard';
import styles from './Buscar.module.css';

/** Buscar (/) — vitrine (mais vendidos, premium+perto) + busca por texto. */
export default function BuscarPage() {
  const router = useRouter();
  const { add } = useCart();
  const { stores } = useStores();
  const { products } = useProducts();
  const { stores: topStores, loading: topStoresLoading } = useTopStores();
  const { products: topProducts, loading: topProductsLoading } = useTopProducts();
  const { addresses } = useAddresses();

  const initialQ = typeof router.query.q === 'string' ? router.query.q : '';
  const [query, setQuery] = useState(initialQ);
  const [category, setCategory] = useState('all');
  useEffect(() => {
    if (typeof router.query.q === 'string') setQuery(router.query.q);
  }, [router.query.q]);

  const isSearch = query.trim().length > 0;

  // Coords do usuário (endereço padrão) para o filtro de proximidade.
  const userCoords = useMemo(() => {
    const a = (addresses || []).find((x: any) => x.isDefault) || (addresses || [])[0];
    return a ? parseCoords(a.latitude, a.longitude) : null;
  }, [addresses]);

  // storeId → loja (coords p/ proximidade, plan p/ premium, name p/ o card).
  const storeById = useMemo(() => {
    const m = new Map<string, any>();
    (stores || []).forEach((s: any) => m.set(s._id, s));
    return m;
  }, [stores]);
  const storeName = useMemo(() => {
    const m = new Map<string, string>();
    (stores || []).forEach((s: any) => m.set(s._id, s.name));
    return m;
  }, [stores]);

  // Produtos do catálogo com storePlan derivado (p/ preencher a vitrine premium).
  const catalogPremium = useMemo(
    () => (products || []).map((p: any) => ({ ...p, storePlan: storeById.get(p.storeId)?.plan })),
    [products, storeById],
  );

  // Vitrine (query vazia): até 5 lojas + 5 produtos, premium+perto+mais vendidos.
  // Preenche em camadas: mais vendidos perto → catálogo perto → (fallback) sem raio,
  // pra nunca ficar quase vazio num marketplace novo (bug "1 loja / 1 produto").
  const vitrineStores = useMemo(
    () => take([
      rankStores(topStores, userCoords, { premiumOnly: true }),
      rankStores(stores, userCoords, { premiumOnly: true }),
      rankStores(topStores, null, { premiumOnly: true }),
      rankStores(stores, null, { premiumOnly: true }),
    ], 5),
    [topStores, stores, userCoords],
  );
  const vitrineProducts = useMemo(
    () => take([
      rankPremiumProducts(topProducts, storeById, userCoords),
      rankPremiumProducts(catalogPremium, storeById, userCoords),
      rankPremiumProducts(topProducts, storeById, null),
      rankPremiumProducts(catalogPremium, storeById, null),
    ], 5),
    [topProducts, catalogPremium, storeById, userCoords],
  );

  // Busca por texto.
  const foundStores = useMemo(() => filterStores(stores, query), [stores, query]);
  const foundProducts = useMemo(
    () => filterProducts(products, query, category === 'all' ? undefined : category),
    [products, query, category],
  );
  const categories = useMemo(() => {
    const base = productCategories(products).map((c) => ({ id: c.id, label: c.label, icon: <Tag size={15} /> }));
    return [{ id: 'all', label: 'Tudo', icon: <LayoutGrid size={15} /> }, ...base];
  }, [products]);

  const addToCart = (p: any, e?: any) => {
    e?.stopPropagation?.();
    add({ productId: p._id, quantity: 1, name: p.name, price: Number(p.price), storeId: p.storeId });
  };

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <SearchField value={query} onChange={setQuery} placeholder="Buscar lojas e produtos…" />
      </div>

      {isSearch ? (
        <>
          {categories.length > 1 && (
            <div className={styles.rail}>
              <CategoryRail categories={categories} activeId={category} onSelect={setCategory} />
            </div>
          )}
          {foundStores.length === 0 && foundProducts.length === 0 ? (
            <EmptyState icon={<LayoutGrid />} title={`Nada encontrado para “${query}”`} />
          ) : (
            <>
              {foundStores.length > 0 && (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Lojas</h2>
                  <div className={styles.storeList}>
                    {foundStores.map((s: any) => (
                      <StoreCard key={s._id} variant="resultado" store={mapStore(s)} onClick={() => router.push(`/stores/${s._id}`)} />
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
                        <ProductCard variant="busca" product={mapProductCard(p, storeName.get(p.storeId))} soldOut={Number(p.quantity) <= 0} onAdd={(e?: any) => addToCart(p, e)} />
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      ) : (
        /* Vitrine */
        <>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Lojas em destaque</h2>
              <Button variant="ghost" size="sm" onClick={() => router.push('/stores')}>Ver mais</Button>
            </div>
            {topStoresLoading ? (
              <p className={styles.muted}>Carregando…</p>
            ) : vitrineStores.length === 0 ? (
              <EmptyState icon={<LayoutGrid />} title="Nenhuma loja por perto ainda" />
            ) : (
              <div className={styles.storeList}>
                {vitrineStores.map((s: any) => (
                  <StoreCard key={s._id} variant="resultado" store={mapStore(s)} onClick={() => router.push(`/stores/${s._id}`)} />
                ))}
              </div>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Mais vendidos</h2>
              <Button variant="ghost" size="sm" onClick={() => router.push('/produtos')}>Ver mais</Button>
            </div>
            {topProductsLoading ? (
              <p className={styles.muted}>Carregando…</p>
            ) : vitrineProducts.length === 0 ? (
              <EmptyState icon={<Tag />} title="Sem produtos em destaque ainda" description="Veja todos os produtos em Ver mais." />
            ) : (
              <div className={styles.productList}>
                {vitrineProducts.map((p: any) => (
                  <div key={p._id} className={styles.productItem} onClick={() => router.push(`/product/${p._id}`)}>
                    <ProductCard variant="busca" product={mapProductCard(p, p.storeName || storeName.get(p.storeId))} soldOut={Number(p.quantity) <= 0} onAdd={(e?: any) => addToCart(p, e)} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
