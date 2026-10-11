import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, MapPin, MessageCircle, Package, Pencil, Search, Store as StoreIcon } from 'lucide-react';

import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { StoreCartPanel } from '../../components/drop/StoreCartPanel';
import { useStores } from '../../hooks/useSync';
import { useStoreProducts } from '../../hooks/useStoreProducts';
import { useStoreQuotes } from '../../hooks/useStoreQuotes';
import { useDeliveryAddress } from '../../hooks/useDeliveryAddress';
import { useAddressPicker } from '../../hooks/useAddressPicker';
import { useAddToCart } from '../../hooks/useAddToCart';
import { useToast } from '../../components/ui/Toast';
import { imageUrl } from '../../lib/config';
import { buscarHref, produtoHref } from '../../lib/routes';
import { deliveryStates } from '../../lib/deliveryView';
import { productCardData } from '../../lib/catalogCards';
import { openStatus, type OperatingHours } from '../../lib/storeHours';

import { IconButton } from '../../components/ui/IconButton';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Tag } from '../../components/ui/Tag';
import { Tabs, tabPanelProps } from '../../components/ui/Tabs';
import { Sheet } from '../../components/ui/Sheet';
import { RadioRow } from '../../components/ui/RadioRow';
import { formatRating } from '../../components/ui/Rating';
import { Alert } from '../../components/ui/Alert';
import { initials } from '../../components/ui/Avatar';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { SearchField } from '../../components/ui/SearchField';
import { ICON_STROKE_WIDTH, ICON_BUTTON_STROKE_WIDTH } from '../../components/ui/Icon';
import { ProductCard } from '../../components/drop/ProductCard';
import { DeliveryBadge } from '../../components/drop/DeliveryBadge';
import { DeliveryAddressControl } from '../../components/drop/DeliveryAddressControl';
import { StoreReviews } from '../../components/drop/StoreReviews';
import { StoreUnavailable } from '../../components/drop/StoreUnavailable';

import styles from './Loja.module.css';

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
  ratingAverage?: number | null;
  ratingCount?: number;
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

export default function StorePage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { user } = useAuth();
  const { cart = [], updateQuantity, removeItem } = useCart();
  const addToCart = useAddToCart();
  const { showToast } = useToast();
  const address = useDeliveryAddress();
  const picker = useAddressPicker();

  const { stores, loading: storesLoading } = useStores();

  const [store, setStore] = useState<StoreWithPlan | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [unavailable, setUnavailable] = useState<null | { _id: string; name: string; neighborhood?: string | null; city?: string | null }>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [detailLoading, setDetailLoading] = useState(true);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORY);
  const [sort, setSort] = useState<SortKey>('name-asc');
  const [sortOpen, setSortOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Loja: por _id ou slug, via useStores() (sincronizado por socket). Categorias
  // reais da loja vêm de GET /categories?storeId=<store._id> (endpoint funcional).
  // `found` fora do efeito: sem a loja na lista o efeito depende de `undefined` (estável), não do array novo a cada render.
  const found = stores.find((s: any) => s._id === id || s.slug === id) as StoreWithPlan | undefined;
  useEffect(() => {
    if (!id || storesLoading) return;
    if (!found) {
      // Fora da lista (cache velho, link/QR de loja pausada): pergunta ao servidor antes de dizer "não encontrada".
      let off = false;
      setStore(null);
      setDetailLoading(true);
      api.get(`/stores/${id}`)
        .then((r) => {
          if (off) return;
          if (r.data?._id) { setStore(r.data); setNotFound(false); } else setNotFound(true);
        })
        .catch((e) => {
          if (off) return;
          const d = e?.response?.data;
          if (d?.code === 'STORE_UNAVAILABLE' && d.store) setUnavailable(d.store); else setNotFound(true);
        })
        .finally(() => { if (!off) setDetailLoading(false); });
      return () => { off = true; };
    }
    setStore(found);
    setNotFound(false);
    setUnavailable(null);
    setDetailLoading(false); // a vitrine não espera as categorias
    let cancelled = false;
    api.get(`/categories?storeId=${found._id}`)
      .then((res) => { if (!cancelled) setCategories(res.data || []); })
      .catch((err) => { console.error(err); if (!cancelled) setCategories([]); });
    return () => { cancelled = true; };
  }, [id, found, storesLoading]);

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

  // Produtos da própria loja (todas as páginas de GET /products?storeId=…) — antes filtrava
  // os 20 primeiros do app inteiro e a loja grande "perdia" o resto do catálogo.
  const { products: storeProducts } = useStoreProducts(store?._id);
  const products = useMemo(() => (store ? storeProducts : []), [store, storeProducts]);

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

  const { quotes, loading: quotesLoading } = useStoreQuotes(store ? [store._id] : [], address.point);
  const quote = store ? quotes[store._id] : undefined;
  const lines = deliveryStates({
    // Estado real do hook: cotação que falhou (429, rede) não fica em "Calculando…" ("Sem cotação: nada").
    quote, loading: quotesLoading && !quote, hasPoint: !!address.point, address: address.label,
    onSetAddress: picker.request, onChangeAddress: picker.request,
  });
  const hours = store ? openStatus(store) : { open: true, closesAt: null, opensAt: null };
  const closed = quote ? quote.open === false : !hours.open;
  const opensAt = quote?.opensAt ?? hours.opensAt;
  const qtyById = useMemo(
    () => Object.fromEntries(cart.filter((i: any) => i.storeId === store?._id).map((i: any) => [i.productId, i.quantity])),
    [cart, store?._id],
  );
  // Esgotados no fim, mantendo a ordenação escolhida entre os disponíveis.
  const ordered = useMemo(
    () => [...filteredSorted.filter((p: any) => Number(p.quantity) > 0), ...filteredSorted.filter((p: any) => !(Number(p.quantity) > 0))],
    [filteredSorted],
  );
  const changeQty = (p: any) => (q: number) => (q <= 0 ? removeItem(p._id) : updateQuantity(p._id, q));
  const addProduct = (p: any) => {
    if (!store) return;
    addToCart({ productId: p._id, quantity: 1, name: p.name, price: Number(p.price), storeId: store._id, storeName: store.name, image: p.image });
  };

  const handleMessage = () => {
    if (!store) return;
    if (!user) { showToast('Entre na sua conta para conversar com a loja.', 'info'); return; }
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

  // ---- Loja pausada (STORE_UNAVAILABLE): a cara da loja e uma saída, sem o motivo ----
  if (unavailable) return <StoreUnavailable store={unavailable} />;

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
              <Button variant="primary" onClick={() => router.push(buscarHref({ tab: 'lojas' }))}>Ver lojas</Button>
            }
          />
        </div>
      </div>
    );
  }


  const isOwner = !!user && (user.id === store.ownerId || user._id === store.ownerId);
  const cover = imageUrl(store.coverBannerUrl || store.featuredBannerUrl, { w: 1200 });
  const hasLocation = !!store.latitude && !!store.longitude;

  const emptyDescription = search
    ? `Não encontramos produtos para "${search}".`
    : selectedCategory !== ALL_CATEGORY
      ? 'Nenhum produto nessa categoria por enquanto.'
      : 'Essa loja ainda não cadastrou produtos.';

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.cover} style={cover ? { backgroundImage: `url(${cover})` } : undefined} aria-hidden="true">
          {!cover && <span className={styles.initials}>{initials(store.name)}</span>}
        </div>
        <span className={styles.back}>
          <IconButton
            variant="onImage"
            aria-label="Voltar"
            icon={<ArrowLeft size={20} strokeWidth={ICON_BUTTON_STROKE_WIDTH} aria-hidden="true" />}
            onClick={() => router.back()}
          />
        </span>
        <span className={styles.searchBtn}>
          <IconButton
            variant="onImage"
            aria-label="Buscar na loja"
            icon={<Search size={20} strokeWidth={ICON_BUTTON_STROKE_WIDTH} aria-hidden="true" />}
            onClick={() => setSearchOpen((v) => !v)}
          />
        </span>
        <div className={styles.head}>
          <span className={styles.logo} aria-hidden="true">{initials(store.name)}</span>
          <h1 className={styles.title}>{store.name}</h1>
          <p className={styles.meta}>{[store.neighborhood || store.city, quote?.distanceKm != null ? `${String(quote.distanceKm).replace('.', ',')} km` : null].filter(Boolean).join(' · ')}</p>
          <div className={styles.facts} aria-live="polite">
            {typeof store.ratingAverage === 'number' && <span className={styles.rating}>{`★ ${formatRating(store.ratingAverage)} (${store.ratingCount})`}</span>}
            {lines.map((s, i) => <DeliveryBadge key={i} state={s} />)}
            {!closed && hours.closesAt && <span className={styles.openPill}>{`Aberta até ${hours.closesAt}`}</span>}
            {closed && opensAt && <span className={styles.closedPill}>{`Fechada · abre às ${opensAt}`}</span>}
          </div>
          <DeliveryAddressControl trigger="link" address={address} picker={picker} storeId={store._id} storeName={store.name} />
          <div className={styles.actions}>
            {hasLocation && (
              <Button
                variant="tertiary"
                size="sm"
                leftIcon={<MapPin size={15} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}
                onClick={() => setShowMap((v) => !v)}
              >
                {showMap ? 'Ocultar mapa' : 'Localização'}
              </Button>
            )}
            <Button
              variant="tertiary"
              size="sm"
              leftIcon={<MessageCircle size={15} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}
              onClick={handleMessage}
            >
              Enviar mensagem
            </Button>
          </div>
        </div>
      </header>

      {closed && (
        <div className={styles.notice}>
          <Alert tone="warning" title="Loja fechada agora">
            {opensAt ? `Abre às ${opensAt}. ` : ''}Você pode montar a sacola e pagar quando ela abrir.
          </Alert>
        </div>
      )}

      {store.description && <p className={styles.desc}>{store.description}</p>}

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

      {/* Mais vendidos (plano 3) */}
      {topProducts.length >= 3 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Mais vendidos</h2>
          <div className={styles.bestSellersRail}>
            {topProducts.map((product: any, idx: number) => (
              <div key={product._id} className={styles.bestSellerItem}>
                <span className={styles.rankBadge}><Badge tone="count">#{idx + 1}</Badge></span>
                <div className={styles.clickable} onClick={() => router.push(produtoHref(product._id))}>
                  <ProductCard
                    variant="recomendado"
                    product={productCardData(product, quote)}
                    quantity={qtyById[product._id]}
                    onQuantityChange={changeQty(product)}
                    onAdd={() => addProduct(product)}
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

      {/* Categorias + busca na loja */}
      <div className={styles.navSection}>
        {categories.length > 0 && (
          <Tabs
            label="Categorias da loja"
            idPrefix="loja-cat"
            value={selectedCategory}
            onChange={setSelectedCategory}
            items={[{ id: ALL_CATEGORY, label: 'Destaques' }, ...categories.map((c) => ({ id: c._id, label: c.name }))]}
          />
        )}
        {(searchOpen || search) && <SearchField value={search} onChange={setSearch} placeholder={`Buscar em ${store.name}…`} />}
      </div>

      <div className={styles.contentGrid}>
        <section className={styles.productsSection}>
          <div className={styles.sortRow}>
            <span className={styles.countText}>
              {filteredSorted.length} produto{filteredSorted.length !== 1 ? 's' : ''}
            </span>
            <button type="button" className={styles.sortButton} onClick={() => setSortOpen(true)}>
              {SORT_OPTIONS.find((o) => o.value === sort)?.label} <ChevronDown size={16} aria-hidden="true" />
            </button>
            <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title="Ordenar por" presentation="bottom">
              <div role="radiogroup" aria-label="Ordenar por">
                {SORT_OPTIONS.map((o) => (
                  <RadioRow key={o.value} name="ordem-loja" value={o.value} checked={sort === o.value} label={o.label}
                    onChange={(v) => { setSort(v as SortKey); setSortOpen(false); }} />
                ))}
              </div>
            </Sheet>
          </div>

          {ordered.length === 0 ? (
            <EmptyState icon={<Package />} title="Nenhum produto encontrado" description={emptyDescription} />
          ) : (
            <div className={styles.productList} {...(categories.length > 0 ? tabPanelProps(selectedCategory, 'loja-cat') : {})}>
              {ordered.map((product: any) => (
                <div key={product._id} className={styles.productRow}>
                  <div className={styles.clickable} onClick={() => router.push(produtoHref(product._id))}>
                    <ProductCard
                      variant="loja"
                      product={productCardData(product, quote)}
                      soldOut={!(Number(product.quantity) > 0)}
                      quantity={qtyById[product._id]}
                      onQuantityChange={changeQty(product)}
                      onAdd={() => addProduct(product)}
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
              ))}
            </div>
          )}
          <StoreReviews storeId={store._id} />
        </section>
        <StoreCartPanel storeId={store._id} />
      </div>
    </div>
  );
}
