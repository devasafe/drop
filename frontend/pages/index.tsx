import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useCart } from '../contexts/CartContext';
import { useProducts } from '../hooks/useSync';
import { imageUrl } from '../lib/config';
import Icon from '../components/Icon';
import BannerCarousel from '../components/BannerCarousel';
import styles from './Index.module.css';
import OnboardingResumeBanner from '../components/OnboardingResumeBanner';

type Product = {
  _id: string;
  name: string;
  description?: string;
  price: number;
  quantity: number;
  image?: string;
  storeId?: string;
};

export default function ProductsPage() {
  const { products, loading: productsLoading } = useProducts();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'name-asc' | 'name-desc' | 'price-asc' | 'price-desc' | 'stock-asc' | 'stock-desc'>('name-asc');
  const [priceRange, setPriceRange] = useState({ min: 0, max: 10000 });
  const loading = productsLoading;

  useEffect(() => {
    if (products.length > 0) {
      const maxPrice = Math.max(...products.map(p => p.price));
      setPriceRange(prev => ({ ...prev, max: maxPrice }));
    }
  }, [products]);

  const { add } = useCart();
  const addToCart = (p: Product) => {
    add({ productId: p._id, quantity: 1, name: p.name, price: p.price, storeId: p.storeId });
    alert('Adicionado ao carrinho!');
  };

  const filtered = useMemo(() => {
    return products.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) &&
      p.price >= priceRange.min &&
      p.price <= priceRange.max
    );
  }, [products, search, priceRange]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'name-asc':   return a.name.localeCompare(b.name);
        case 'name-desc':  return b.name.localeCompare(a.name);
        case 'price-asc':  return a.price - b.price;
        case 'price-desc': return b.price - a.price;
        case 'stock-asc':  return a.quantity - b.quantity;
        case 'stock-desc': return b.quantity - a.quantity;
        default:           return 0;
      }
    });
  }, [filtered, sort]);

  const maxPrice = products.length > 0 ? Math.max(...products.map(p => p.price)) : 10000;
  const rangePercent = maxPrice > 0 ? (priceRange.max / maxPrice) * 100 : 100;

  const stats = [
    { label: 'Total',      value: products.length,                               color: 'rgba(255,255,255,0.5)' },
    { label: 'Filtrados',  value: sorted.length,                                 color: 'var(--drop-purple-2)' },
    { label: 'Em estoque', value: products.filter(p => p.quantity > 0).length,   color: 'var(--drop-success)' },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.container}>

        <BannerCarousel />

        <OnboardingResumeBanner />

        <div className={styles.header}>
          <h1 className={styles.title}>Produtos</h1>
          <p className={styles.subtitle}>
            {loading ? 'Carregando...' : `${products.length} produto${products.length !== 1 ? 's' : ''} disponíve${products.length !== 1 ? 'is' : 'l'}`}
          </p>
        </div>

        <div className={styles.filtersBar}>
          {/* Search */}
          <div className={styles.searchWrapper}>
            <label className={styles.fieldLabel}>Buscar</label>
            <div className={styles.inputWrap}>
              <svg className={styles.inputIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                className={styles.input}
                placeholder="Nome do produto..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Sort */}
          <div className={styles.sortWrapper}>
            <label className={styles.fieldLabel}>Ordenar</label>
            <select className={styles.select} value={sort} onChange={e => setSort(e.target.value as any)}>
              <option value="name-asc">Nome (A–Z)</option>
              <option value="name-desc">Nome (Z–A)</option>
              <option value="price-asc">Preço ↑</option>
              <option value="price-desc">Preço ↓</option>
              <option value="stock-asc">Estoque ↑</option>
              <option value="stock-desc">Estoque ↓</option>
            </select>
          </div>

          {/* Price Range */}
          <div className={styles.priceWrapper}>
            <div className={styles.priceLabelRow}>
              <span>Preço máximo</span>
              <span className={styles.priceVal}>R$ {priceRange.max}</span>
            </div>
            <input
              type="range"
              className={styles.rangeInput}
              min="0"
              max={maxPrice}
              value={priceRange.max}
              onChange={e => setPriceRange(prev => ({ ...prev, max: Number(e.target.value) }))}
              style={{ background: `linear-gradient(to right, var(--drop-purple) 0%, var(--drop-purple-2) ${rangePercent}%, rgba(255,255,255,0.1) ${rangePercent}%)` }}
            />
          </div>

          {/* Stats */}
          <div className={styles.statsGroup}>
            {stats.map(stat => (
              <div key={stat.label} className={styles.statChip}>
                <div className={styles.statValue} style={{ color: stat.color }}>{stat.value}</div>
                <div className={styles.statLabel}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className={styles.grid}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="drop-skeleton-card" style={{ animationDelay: `${i * 0.06}s`, animation: 'drop-card-enter 0.5s cubic-bezier(0.4,0,0,1) both' }}>
                <div className="drop-skeleton-img" />
                <div style={{ padding: '4px 0' }}>
                  <div className="drop-skeleton-line" />
                  <div className="drop-skeleton-line" />
                  <div className="drop-skeleton-line" />
                  <div className="drop-skeleton-line" />
                </div>
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><Icon name="search" size={48} /></div>
            <p className={styles.emptyText}>
              {products.length === 0 ? 'Nenhum produto disponível no momento' : `Nenhum produto encontrado para "${search}"`}
            </p>
          </div>
        ) : (
          <div className={styles.grid}>
            {sorted.map((product, idx) => (
              <div key={product._id} className={styles.card} style={{ animationDelay: `${Math.min(idx * 0.04, 0.3)}s` }}>
                <div className={styles.imageBox}>
                  {product.image ? (
                    <img src={imageUrl(product.image)} alt={product.name} className={styles.productImage} />
                  ) : (
                    <div className={styles.imagePlaceholder}><Icon name="package" size={32} /></div>
                  )}
                  {product.quantity <= 0 && (
                    <div className={styles.outOfStockOverlay}>
                      <span className={styles.outOfStockBadge}>Esgotado</span>
                    </div>
                  )}
                </div>

                <div className={styles.cardBody}>
                  <Link href={`/product/${product._id}`} className={styles.productName}>
                    {product.name}
                  </Link>

                  {product.description && (
                    <p className={styles.productDesc}>
                      {product.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110)}
                      {product.description.replace(/<[^>]*>/g, '').trim().length > 110 ? '…' : ''}
                    </p>
                  )}

                  <div className={`${styles.stockRow} ${product.quantity > 0 ? styles.inStock : styles.outStock}`}>
                    <span className={styles.stockDot} />
                    {product.quantity > 0 ? `${product.quantity} em estoque` : 'Fora de estoque'}
                  </div>

                  <div className={styles.cardFooter}>
                    <div>
                      <div className={styles.priceLabel}>Preço</div>
                      <div className={styles.priceValue}>R$ {product.price.toFixed(2)}</div>
                    </div>
                    <button
                      className={styles.addBtn}
                      onClick={() => addToCart(product)}
                      disabled={product.quantity <= 0}
                    >
                      {product.quantity <= 0 ? 'Indisponível' : 'Adicionar'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {sorted.length > 0 && (
          <div className={styles.footerCount}>
            {sorted.length} de {products.length} produto{products.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
