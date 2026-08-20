import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  LayoutGrid,
  MapPin,
  MessageCircle,
  Package,
  Pencil,
  Store as StoreIcon,
  Tag as TagIcon,
} from 'lucide-react';

import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { StoreCartPanel } from '../../components/drop/StoreCartPanel';
import { useProducts, useStores } from '../../hooks/useSync';
import { imageUrl } from '../../lib/config';

import { IconButton } from '../../components/ui/IconButton';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Tag } from '../../components/ui/Tag';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { SearchField } from '../../components/ui/SearchField';
import { ICON_STROKE_WIDTH, ICON_BUTTON_STROKE_WIDTH } from '../../components/ui/Icon';
import { CategoryRail, Category as CategoryChip } from '../../components/drop/CategoryRail';
import { ProductCard } from '../../components/drop/ProductCard';

import styles from '../StoreDetail.module.css';

type DayConfig = { open: string; close: string; closed: boolean };
type OperatingHours = Partial<Record<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday', DayConfig>>;

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

type Category = { _id: string; name: string };

type SortKey = 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc';

const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Nome (A–Z)' },
  { value: 'name-desc', label: 'Nome (Z–A)' },
  { value: 'price-asc', label: 'Menor preço' },
  { value: 'price-desc', label: 'Maior preço' },
];

const ALL_CATEGORY = 'all';

const DAYS_MAP = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/** Status aberta/fechada calculado a partir de `operatingHours`/`isOpen` da loja. */
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

/** Estoque de um item do catálogo → estado visual do ProductCard (spec §"estoque").
 * Estoque farto não ganha rótulo (nada inventado) — só esgotado ou baixo (<=3). */
function getStockState(quantity: number): { soldOut: boolean; stockLabel?: string } {
  if (quantity <= 0) return { soldOut: true };
  if (quantity <= 3) return { soldOut: false, stockLabel: `Restam ${quantity}` };
  return { soldOut: false };
}

export default function StorePage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { user } = useAuth();
  const { add } = useCart();

  const { stores, loading: storesLoading } = useStores();
  const { products: allProducts } = useProducts();

  const [store, setStore] = useState<StoreWithPlan | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [detailLoading, setDetailLoading] = useState(true);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORY);
  const [sort, setSort] = useState<SortKey>('name-asc');

  // Loja: por _id ou slug, via useStores() (sincronizado por socket). Categorias
  // reais da loja vêm de GET /categories?storeId=<store._id> (endpoint funcional).
  useEffect(() => {
    if (!id || storesLoading) return;
    const found = stores.find((s: any) => s._id === id || s.slug === id) as StoreWithPlan | undefined;
    if (!found) {
      setStore(null);
      setNotFound(true);
      setDetailLoading(false);
      return;
    }
    setStore(found);
    setNotFound(false);
    let cancelled = false;
    api.get(`/categories?storeId=${found._id}`)
      .then((res) => { if (!cancelled) setCategories(res.data || []); })
      .catch((err) => { console.error(err); if (!cancelled) setCategories([]); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [id, stores, storesLoading]);

  // Mais Vendidos: exclusivo do plano 3.
  useEffect(() => {
    if (!id || !store || Number(store.plan) !== 3) {
      setTopProducts([]);
      return;
    }
    let cancelled = false;
    api.get(`/stores/${id}/top-products?limit=8`)
      .then((res) => { if (!cancelled) setTopProducts(res.data?.products || []); })
      .catch(() => { if (!cancelled) setTopProducts([]); });
    return () => { cancelled = true; };
  }, [id, store]);

  const products = useMemo(() => {
    if (!store) return [];
    return allProducts.filter((p: any) => String(p.storeId) === String(store._id));
  }, [store, allProducts]);

  const filteredSorted = useMemo(() => {
    let list = products.filter((p: any) => p.name.toLowerCase().includes(search.toLowerCase()));
    if (selectedCategory !== ALL_CATEGORY) {
      list = list.filter((p: any) => (p.categoryId || p.category) === selectedCategory);
    }
    return [...list].sort((a: any, b: any) => {
      switch (sort) {
        case 'name-asc': return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        case 'price-asc': return a.price - b.price;
        case 'price-desc': return b.price - a.price;
        default: return 0;
      }
    });
  }, [products, search, selectedCategory, sort]);

  const addToCart = (p: any) => {
    if (!store) return;
    add({ productId: p._id, quantity: 1, name: p.name, price: p.price, storeId: store._id });
  };

  const handleMessage = () => {
    if (!store) return;
    if (!user) { alert('Por favor, faça login para iniciar um chat'); return; }
    window.dispatchEvent(new CustomEvent('openChat', {
      detail: { storeId: store._id, storeName: store.name || 'Loja', role: 'lojista' },
    }));
  };

  // ---- Loading ----
  if (detailLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingWrap}>
          <Skeleton height={220} radius={0} />
          <div className={styles.loadingList}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height={72} radius={13} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---- Not found ----
  if (notFound || !store) {
    return (
      <div className={styles.page}>
        <div className={styles.notFoundWrap}>
          <EmptyState
            icon={<StoreIcon />}
            title="Loja não encontrada"
            description="Essa loja pode ter sido removida ou o link está incorreto."
            action={
              <Button variant="primary" onClick={() => router.push('/stores')}>Ver lojas</Button>
            }
          />
        </div>
      </div>
    );
  }

  const isOwner = !!user && (user.id === store.ownerId || user._id === store.ownerId);
  const status = getStoreOpenStatus(store);
  const bannerUrl = imageUrl(store.coverBannerUrl || store.featuredBannerUrl);
  const hasLocation = !!store.latitude && !!store.longitude;

  const categoryChips: CategoryChip[] = [
    { id: ALL_CATEGORY, label: 'Todos', icon: <LayoutGrid size={16} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" /> },
    ...categories.map((c) => ({
      id: c._id,
      label: c.name,
      icon: <TagIcon size={16} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />,
    })),
  ];

  const emptyDescription = search
    ? `Não encontramos produtos para "${search}".`
    : selectedCategory !== ALL_CATEGORY
      ? 'Nenhum produto nessa categoria por enquanto.'
      : 'Essa loja ainda não cadastrou produtos.';

  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.hero}>
        <span
          className={styles.heroImage}
          style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined}
          aria-hidden="true"
        >
          {!bannerUrl && <StoreIcon size={32} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}
        </span>
        <span className={styles.heroGradient} aria-hidden="true" />

        <span className={styles.backBtn}>
          <IconButton
            icon={<ArrowLeft size={18} strokeWidth={ICON_BUTTON_STROKE_WIDTH} aria-hidden="true" />}
            variant="onImage"
            aria-label="Voltar"
            onClick={() => router.back()}
          />
        </span>

        <div className={styles.heroBottom}>
          <div className={styles.heroProfile}>
            <span className={styles.heroAvatar} aria-hidden="true">{store.name.charAt(0).toUpperCase()}</span>
            <div className={styles.heroMeta}>
              <div className={styles.heroNameRow}>
                <h1 className={styles.heroName}>{store.name}</h1>
                <span className={status.open ? styles.statusOpen : styles.statusClosed}>
                  <span className={styles.statusDot} aria-hidden="true" />
                  {status.label}
                </span>
              </div>
              <div className={styles.heroStats}>
                <span className={styles.heroStat}>
                  <b>{products.length}</b> produto{products.length !== 1 ? 's' : ''}
                </span>
                <span className={styles.heroStat}>
                  <b>{categories.length}</b> categoria{categories.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.heroActions}>
            {hasLocation && (
              <Button
                variant="onImage"
                size="sm"
                leftIcon={<MapPin size={15} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}
                onClick={() => setShowMap((v) => !v)}
              >
                {showMap ? 'Ocultar mapa' : 'Localização'}
              </Button>
            )}
            <Button
              variant="onImage"
              size="sm"
              leftIcon={<MessageCircle size={15} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}
              onClick={handleMessage}
            >
              Enviar mensagem
            </Button>
          </div>
        </div>
      </section>

      {/* Descrição */}
      {store.description && (
        <div className={styles.descSection}>
          <p className={styles.descText}>{store.description}</p>
        </div>
      )}

      {/* Mapa (toggle) */}
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
              <MapPin size={13} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
              {store.street}
            </div>
          )}
        </div>
      )}

      {/* Mais Vendidos (plano 3) */}
      {topProducts.length >= 3 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Mais vendidos</h2>
          <div className={styles.bestSellersRail}>
            {topProducts.map((product: any, idx: number) => (
              <div key={product._id} className={styles.bestSellerItem}>
                <span className={styles.rankBadge}><Badge tone="count">#{idx + 1}</Badge></span>
                <div
                  className={styles.bestSellerCard}
                  onClick={() => router.push(`/product/${product._id}`)}
                >
                  <ProductCard
                    variant="recomendado"
                    product={{
                      name: product.name,
                      imageUrl: imageUrl(product.image) || undefined,
                      price: Number(product.price),
                    }}
                    onAdd={(e?: any) => {
                      e?.stopPropagation?.();
                      addToCart(product);
                    }}
                  />
                </div>
                <div className={styles.soldCaption}>
                  <Tag>{product.quantity} vendido{product.quantity !== 1 ? 's' : ''}</Tag>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Categorias + busca */}
      <div className={styles.navSection}>
        {categories.length > 0 && (
          <CategoryRail
            categories={categoryChips}
            activeId={selectedCategory}
            onSelect={setSelectedCategory}
          />
        )}
        <div className={styles.searchRow}>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder={`Buscar em ${store.name}…`}
          />
        </div>
      </div>

      {/* Produtos + carrinho (desktop 2-col estilo iFood) */}
      <div className={styles.contentGrid}>
      <section className={styles.productsSection}>
        <div className={styles.sortRow}>
          <span className={styles.countText}>
            {filteredSorted.length} produto{filteredSorted.length !== 1 ? 's' : ''}
          </span>
          <Select value={sort} onChange={(v) => setSort(v as SortKey)} options={SORT_OPTIONS} />
        </div>

        {filteredSorted.length === 0 ? (
          <EmptyState icon={<Package />} title="Nenhum produto encontrado" description={emptyDescription} />
        ) : (
          <div className={styles.productList}>
            {filteredSorted.map((product: any) => {
              const stock = getStockState(Number(product.quantity) || 0);
              return (
                <div key={product._id} className={styles.productRow}>
                  <div
                    className={styles.productClickable}
                    onClick={() => router.push(`/product/${product._id}`)}
                  >
                    <ProductCard
                      variant="loja"
                      product={{
                        name: product.name,
                        imageUrl: imageUrl(product.image) || undefined,
                        price: Number(product.price),
                      }}
                      soldOut={stock.soldOut}
                      stockLabel={stock.stockLabel}
                      onAdd={(e?: any) => {
                        e?.stopPropagation?.();
                        addToCart(product);
                      }}
                    />
                  </div>
                  {isOwner && (
                    <button
                      type="button"
                      className={styles.ownerBadge}
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/seller/edit-product?edit=${product._id}`);
                      }}
                    >
                      <Pencil size={11} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
                      Editar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
        <StoreCartPanel storeId={store._id} />
      </div>

    </div>
  );
}
