import { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Tag, LayoutGrid, ArrowLeft } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useProducts, useStores } from '../hooks/useSync';
import { filterProducts, productCategories, mapProductCard } from '../lib/searchCatalog';
import { isPremium } from '../lib/catalogRanking';
import { IconButton } from '../components/ui/IconButton';
import { EmptyState } from '../components/ui/EmptyState';
import { CategoryRail } from '../components/drop/CategoryRail';
import { ProductCard } from '../components/drop/ProductCard';
import styles from './Produtos.module.css';

/** /produtos — grade com todos os produtos (lojas premium primeiro). */
export default function ProdutosPage() {
  const router = useRouter();
  const { add } = useCart();
  const { products } = useProducts();
  const { stores } = useStores();
  const [category, setCategory] = useState('all');

  // storeId → { name, plan } (nome no card + ordenação premium-primeiro).
  const storeInfo = useMemo(() => {
    const m = new Map<string, { name: string; plan: any }>();
    (stores || []).forEach((s: any) => m.set(s._id, { name: s.name, plan: s.plan }));
    return m;
  }, [stores]);

  const categories = useMemo(() => {
    const base = productCategories(products).map((c) => ({ id: c.id, label: c.label, icon: <Tag size={15} /> }));
    return [{ id: 'all', label: 'Tudo', icon: <LayoutGrid size={15} /> }, ...base];
  }, [products]);

  // Todos os produtos da categoria, lojas premium primeiro (ordem estável).
  const ordered = useMemo(() => {
    const list = filterProducts(products, '', category === 'all' ? undefined : category);
    return [...list].sort((a: any, b: any) => {
      const pa = isPremium({ plan: storeInfo.get(a.storeId)?.plan }) ? 0 : 1;
      const pb = isPremium({ plan: storeInfo.get(b.storeId)?.plan }) ? 0 : 1;
      return pa - pb;
    });
  }, [products, category, storeInfo]);

  const addToCart = (p: any, e?: any) => {
    e?.stopPropagation?.();
    add({ productId: p._id, quantity: 1, name: p.name, price: Number(p.price), storeId: p.storeId });
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <IconButton aria-label="Voltar" variant="soft" icon={<ArrowLeft size={18} />} onClick={() => router.back()} />
        <h1 className={styles.title}>Produtos</h1>
      </header>

      {categories.length > 1 && (
        <div className={styles.rail}>
          <CategoryRail categories={categories} activeId={category} onSelect={setCategory} />
        </div>
      )}

      {ordered.length === 0 ? (
        <EmptyState icon={<LayoutGrid />} title="Nenhum produto por aqui ainda" />
      ) : (
        <div className={styles.grid}>
          {ordered.map((p: any) => (
            <div key={p._id} className={styles.cell} onClick={() => router.push(`/product/${p._id}`)}>
              <ProductCard
                variant="home"
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
