import { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Tag, LayoutGrid, ArrowLeft } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useProducts, useStores } from '../hooks/useSync';
import { mapProductCard } from '../lib/searchCatalog';
import { isPremium } from '../lib/catalogRanking';
import { IconButton } from '../components/ui/IconButton';
import { SearchField } from '../components/ui/SearchField';
import { EmptyState } from '../components/ui/EmptyState';
import { CategoryRail } from '../components/drop/CategoryRail';
import { ProductCard } from '../components/drop/ProductCard';
import styles from './Produtos.module.css';

/** /produtos — grade com todos os produtos (busca + filtro por categoria,
 * lojas premium primeiro). */
export default function ProdutosPage() {
  const router = useRouter();
  const { add } = useCart();
  const { products } = useProducts();
  const { stores } = useStores();
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  // storeId → { name, plan } (nome no card + ordenação premium-primeiro).
  const storeInfo = useMemo(() => {
    const m = new Map<string, { name: string; plan: any }>();
    (stores || []).forEach((s: any) => m.set(s._id, { name: s.name, plan: s.plan }));
    return m;
  }, [stores]);

  // Categorias deduplicadas por NOME (evita dois chips "Eletrônicos" quando há
  // categorias com o mesmo nome e ids diferentes). Filtro passa a ser por nome.
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const base: { id: string; label: string; icon: JSX.Element }[] = [];
    (products || []).forEach((p: any) => {
      const name = p.categoryName;
      if (name && !seen.has(name)) { seen.add(name); base.push({ id: name, label: name, icon: <Tag size={15} /> }); }
    });
    base.sort((a, b) => a.label.localeCompare(b.label));
    return [{ id: 'all', label: 'Tudo', icon: <LayoutGrid size={15} /> }, ...base];
  }, [products]);

  const ordered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (products || []).filter((p: any) => {
      if (q && !(p.name || '').toLowerCase().includes(q)) return false;
      if (category !== 'all' && p.categoryName !== category) return false;
      return true;
    });
    // Lojas premium primeiro (ordem estável).
    return [...list].sort((a: any, b: any) => {
      const pa = isPremium({ plan: storeInfo.get(a.storeId)?.plan }) ? 0 : 1;
      const pb = isPremium({ plan: storeInfo.get(b.storeId)?.plan }) ? 0 : 1;
      return pa - pb;
    });
  }, [products, search, category, storeInfo]);

  const addToCart = (p: any, e?: any) => {
    e?.stopPropagation?.();
    add({ productId: p._id, quantity: 1, name: p.name, price: Number(p.price), storeId: p.storeId });
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <IconButton aria-label="Voltar" variant="soft" icon={<ArrowLeft size={18} />} onClick={() => router.back()} />
        <div className={styles.headText}>
          <h1 className={styles.title}>Produtos</h1>
          <p className={styles.subtitle}>{ordered.length} {ordered.length === 1 ? 'produto' : 'produtos'}</p>
        </div>
      </header>

      <div className={styles.searchRow}>
        <SearchField value={search} onChange={setSearch} placeholder="Buscar produtos…" />
      </div>

      {categories.length > 1 && (
        <div className={styles.rail}>
          <CategoryRail categories={categories} activeId={category} onSelect={setCategory} />
        </div>
      )}

      {ordered.length === 0 ? (
        <EmptyState icon={<LayoutGrid />} title={search ? `Nada encontrado para “${search}”` : 'Nenhum produto por aqui ainda'} />
      ) : (
        <div className={styles.grid}>
          {ordered.map((p: any) => (
            <div key={p._id} className={styles.cell} onClick={() => router.push(`/product/${p._id}`)}>
              <ProductCard
                variant="grade"
                product={mapProductCard(p, storeInfo.get(p.storeId)?.name)}
                soldOut={Number(p.quantity) <= 0}
                onAdd={(e?: any) => addToCart(p, e)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
