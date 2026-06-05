import { useRouter } from 'next/router';
import { useEffect, useState, useMemo } from 'react';
import api from '../../lib/api';
import Link from 'next/link';
import Icon from '../../components/Icon';
import { useCart } from '../../contexts/CartContext';
import { useProducts, useStores } from '../../hooks/useSync';
import { imageUrl } from '../../lib/config';
import styles from './StoreDetail.module.css';

type DayConfig = { open: string; close: string; closed: boolean };
type OperatingHours = Partial<Record<'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'|'sunday', DayConfig>>;

type StoreWithPlan = {
  _id: string;
  name: string;
  description?: string;
  plan?: number;
  coverBannerUrl?: string;
  featuredBannerUrl?: string;
  ownerId?: string;
  street?: string;
  latitude?: string;
  longitude?: string;
  isOpen?: boolean;
  operatingHours?: OperatingHours;
  [key: string]: unknown;
};

const DAYS_MAP = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;

function getStoreOpenStatus(store: StoreWithPlan): { open: boolean; label: string } {
  if (store.isOpen === false) return { open: false, label: 'Fechada' };
  const hours = store.operatingHours;
  if (!hours) return { open: true, label: 'Aberta' };
  const now = new Date();
  const dayKey = DAYS_MAP[now.getDay()];
  const day = hours[dayKey];
  if (!day) return { open: true, label: 'Aberta' };
  if (day.closed) return { open: false, label: 'Fechada hoje' };
  if (!day.open || !day.close) return { open: true, label: 'Aberta' };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = day.open.split(':').map(Number);
  const [ch, cm] = day.close.split(':').map(Number);
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  if (nowMin >= openMin && nowMin < closeMin) {
    return { open: true, label: `Aberta · ${day.close}` };
  }
  return { open: false, label: `Fechada · ${day.open}` };
}

export default function StorePage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { add } = useCart();

  const [store, setStore] = useState<StoreWithPlan | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<'name-asc' | 'name-desc' | 'price-asc' | 'price-desc'>('name-asc');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [showMap, setShowMap] = useState(false);

  const { products: allProducts } = useProducts();
  const { stores } = useStores();

  useEffect(() => {
    if (!id || !store) return;
    if (Number(store.plan) !== 3) { setTopProducts([]); return; }
    api.get(`/stores/${id}/top-products?limit=8`)
      .then(res => setTopProducts(res.data?.products || []))
      .catch(() => setTopProducts([]));
  }, [id, store]);

  useEffect(() => {
    if (!id || stores.length === 0) return;
    (async () => {
      try {
        const foundStore = stores.find((s: any) => s._id === id || s.slug === id);
        if (foundStore) {
          setStore(foundStore);
          const catRes = await api.get(`/categories?storeId=${foundStore._id}`);
          setCategories(catRes.data || []);
        }
        setLoading(false);
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    })();
  }, [id, stores]);

  const products = useMemo(() => {
    if (!store) return [];
    return allProducts.filter((p: any) => String(p.storeId) === String(store._id));
  }, [store, allProducts]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userRaw = localStorage.getItem('user');
      setUser(userRaw ? JSON.parse(userRaw) : null);
    }
  }, []);

  if (loading) {
    return (
      <div className={styles.page} style={{ padding: '40px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="drop-skeleton-card" style={{ animationDelay: `${i * 0.06}s`, animation: 'drop-card-enter 0.5s cubic-bezier(0.4,0,0,1) both' }}>
              <div className="drop-skeleton-img" style={{ height: 200 }} />
              <div style={{ padding: '4px 0' }}>
                <div className="drop-skeleton-line" />
                <div className="drop-skeleton-line" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className={styles.centered}>
        <div className={styles.notFoundIcon}><Icon name="store" size={32} /></div>
        <p className={styles.notFoundText}>Loja não encontrada</p>
        <Link href="/stores" className={styles.notFoundLink}>Ver Lojas</Link>
      </div>
    );
  }

  const isOwner = user && (user.id === store.ownerId || user._id === store.ownerId);
  const status = getStoreOpenStatus(store);
  const bannerUrl = store.coverBannerUrl || store.featuredBannerUrl;
  const hasLocation = store.latitude && store.longitude;

  let filtered = products.filter((p: any) => p.name.toLowerCase().includes(search.toLowerCase()));
  if (selectedCategory) filtered = filtered.filter((p: any) => p.category === selectedCategory);

  const sorted = [...filtered].sort((a: any, b: any) => {
    switch (sort) {
      case 'name-asc':   return a.name.localeCompare(b.name);
      case 'name-desc':  return b.name.localeCompare(a.name);
      case 'price-asc':  return a.price - b.price;
      case 'price-desc': return b.price - a.price;
      default:           return 0;
    }
  });

  const getStockInfo = (qty: number) => {
    if (qty <= 0) return { label: 'Esgotado', cls: styles.outOfStock };
    if (qty <= 3) return { label: `Restam ${qty}`, cls: styles.lowStock };
    return { label: `${qty} em estoque`, cls: styles.inStock };
  };

  return (
    <div className={styles.page}>
      {/* Cinematic Hero */}
      <section className={styles.hero}>
        {bannerUrl ? (
          <img src={imageUrl(bannerUrl)} alt={store.name} className={styles.heroCover} />
        ) : (
          <div className={styles.heroFallback} />
        )}
        <div className={styles.heroGradient} />

        <div className={styles.heroBottom}>
          <div className={styles.heroProfile}>
            <div className={styles.heroAvatar}>
              {store.name.charAt(0).toUpperCase()}
            </div>
            <div className={styles.heroMeta}>
              <div className={styles.heroNameRow}>
                <h1 className={styles.heroName}>{store.name}</h1>
                <span className={status.open ? styles.statusOpen : styles.statusClosed}>
                  {status.label}
                </span>
              </div>
              <div className={styles.heroStatsRow}>
                <div className={styles.heroStatBlock}>
                  <span className={styles.heroStatValue}>{products.length}</span>
                  <span className={styles.heroStatLabel}>Produtos</span>
                </div>
                <div className={styles.heroStatBlock}>
                  <span className={styles.heroStatValue}>{categories.length}</span>
                  <span className={styles.heroStatLabel}>Categorias</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.heroActions}>
            {hasLocation && (
              <button className={styles.locationBtn} onClick={() => setShowMap(v => !v)}>
                <Icon name="map-pin" size={14} />
                {showMap ? 'Ocultar Mapa' : 'Localização'}
              </button>
            )}
            <button
              className={styles.chatBtn}
              onClick={() => {
                if (!user) { alert('Por favor, faça login para iniciar um chat'); return; }
                window.dispatchEvent(new CustomEvent('openChat', {
                  detail: { storeId: store._id, storeName: store.name || 'Loja', role: 'lojista' }
                }));
              }}
            >
              <Icon name="chat" size={14} />
              Enviar Mensagem
            </button>
          </div>
        </div>
      </section>

      {/* Description */}
      {store.description && (
        <div className={styles.descSection}>
          <p className={styles.descText}>{store.description}</p>
        </div>
      )}

      {/* Map (toggle) */}
      {showMap && hasLocation && (
        <div className={styles.mapSection}>
          <div className={styles.mapWrap}>
            <iframe
              title="Mapa da loja"
              width="100%"
              height="100%"
              className={styles.mapIframe}
              src={`https://www.google.com/maps?q=${store.latitude},${store.longitude}&markers=${store.latitude},${store.longitude}&z=17&output=embed`}
              allowFullScreen
            />
          </div>
          {store.street && (
            <div className={styles.mapAddress}>
              <Icon name="map-pin" size={12} />
              {store.street}
            </div>
          )}
        </div>
      )}

      {/* Best sellers */}
      {topProducts.length >= 3 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Mais Vendidos</h2>
          <div className={styles.bestSellers}>
            {topProducts.map((product: any, idx: number) => (
              <Link key={product._id} href={`/product/${product._id}`} className={`${styles.productCard} ${styles.bestSellerCard}`}>
                <div className={styles.bestSellerRank}>#{idx + 1}</div>
                <div className={styles.productImageBox}>
                  {product.image ? (
                    <img src={imageUrl(product.image)} alt={product.name} className={styles.productImage} />
                  ) : (
                    <div className={styles.productImagePlaceholder}><Icon name="package" size={24} /></div>
                  )}
                </div>
                <div className={styles.productBody}>
                  <div className={styles.productHeader}>
                    <h3 className={styles.productName}>{product.name}</h3>
                    <span className={styles.productPrice}>R$ {product.price?.toFixed(2).replace('.', ',')}</span>
                  </div>
                  <div className={styles.productFooter}>
                    <div className={styles.bestSellerSold}>{product.quantity} vendido{product.quantity !== 1 ? 's' : ''}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Categories + Search */}
      <div className={styles.navSection}>
        {categories.length > 0 && (
          <div className={styles.catList}>
            {[{ _id: null, name: 'Todos' }, ...categories].map((cat: any) => (
              <button
                key={cat._id ?? 'all'}
                className={`${styles.catBtn} ${selectedCategory === cat._id ? styles.catBtnActive : ''}`}
                onClick={() => setSelectedCategory(cat._id)}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
        <div className={styles.searchWrap}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={`BUSCAR EM ${store.name.toUpperCase()}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <span className={styles.searchIcon}><Icon name="search" size={14} /></span>
        </div>
      </div>

      {/* Products */}
      <div className={styles.productsSection}>
        <div className={styles.sortRow}>
          <span className={styles.countText}>
            {sorted.length} produto{sorted.length !== 1 ? 's' : ''}
          </span>
          <select className={styles.sortSelect} value={sort} onChange={e => setSort(e.target.value as any)}>
            <option value="name-asc">Nome (A–Z)</option>
            <option value="name-desc">Nome (Z–A)</option>
            <option value="price-asc">Menor Preço</option>
            <option value="price-desc">Maior Preço</option>
          </select>
        </div>

        {sorted.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><Icon name="package" size={32} /></div>
            <p className={styles.emptyText}>Nenhum produto encontrado</p>
          </div>
        ) : (
          <div className={styles.productGrid}>
            {sorted.map((product: any) => {
              const stock = getStockInfo(product.quantity);
              return (
                <Link key={product._id} href={`/product/${product._id}`} className={styles.productCard}>
                  <div className={styles.productImageBox}>
                    {product.image ? (
                      <img src={imageUrl(product.image)} alt={product.name} className={styles.productImage} />
                    ) : (
                      <div className={styles.productImagePlaceholder}><Icon name="package" size={32} /></div>
                    )}
                    {product.quantity <= 0 && (
                      <div className={styles.soldOutOverlay}>
                        <span className={styles.soldOutBadge}>Esgotado</span>
                      </div>
                    )}
                  </div>
                  <div className={styles.productBody}>
                    <div className={styles.productHeader}>
                      <h3 className={styles.productName}>{product.name}</h3>
                      <span className={styles.productPrice}>R$ {product.price?.toFixed(2).replace('.', ',')}</span>
                    </div>
                    {product.description && <p className={styles.productDesc}>{product.description}</p>}
                    <div className={styles.productFooter}>
                      <div className={`${styles.productStock} ${stock.cls}`}>
                        <span className={styles.stockDot} />
                        {stock.label}
                      </div>
                      <button
                        className={styles.addCartBtn}
                        onClick={(e) => {
                          e.preventDefault();
                          if (product.quantity > 0) {
                            add({ productId: product._id, quantity: 1, name: product.name, price: product.price, storeId: store._id });
                          }
                        }}
                      >
                        <Icon name="shopping-cart" size={18} />
                      </button>
                    </div>
                    {isOwner && <div className={styles.ownerBadge}>Editar</div>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
