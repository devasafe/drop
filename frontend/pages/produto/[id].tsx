import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowLeft, Package, Zap } from 'lucide-react';

import api from '../../lib/api';
import { useProducts, useStores } from '../../hooks/useSync';
import { useSaasConfig } from '../../hooks/useSaasConfig';
import { useCardFeeConfig } from '../../hooks/useCardFeeConfig';
import { useStoreQuotes } from '../../hooks/useStoreQuotes';
import { useDeliveryAddress } from '../../hooks/useDeliveryAddress';
import { useAddressPicker } from '../../hooks/useAddressPicker';
import { useAddToCart } from '../../hooks/useAddToCart';
import { installmentOptions } from '../../lib/cardInstallments';
import { deliveryStates } from '../../lib/deliveryView';
import { productCardData } from '../../lib/catalogCards';
import { formatMoney } from '../../lib/money';
import { lojaHref, produtoHref, ROUTES } from '../../lib/routes';

import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Tag } from '../../components/ui/Tag';
import { Rating, formatRating } from '../../components/ui/Rating';
import { QuantitySelector } from '../../components/ui/QuantitySelector';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ICON_BUTTON_STROKE_WIDTH } from '../../components/ui/Icon';
import { ProductCard } from '../../components/drop/ProductCard';
import { PriceDisplay } from '../../components/drop/PriceDisplay';
import { DeliveryBadge } from '../../components/drop/DeliveryBadge';
import { DeliveryAddressControl } from '../../components/drop/DeliveryAddressControl';
import { ProductGallery } from '../../components/drop/ProductGallery';
import HtmlContent from '../../components/HtmlContent';

import styles from './Produto.module.css';
import { goBack } from '../../lib/navigation';

interface ReviewsData {
  average: number;
  count: number;
  reviews: { _id: string; rating: number; comment?: string; userName: string; createdAt: string }[];
}

export default function ProductPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const addToCart = useAddToCart();
  const { settlementMode, directCardEnabled } = useSaasConfig();
  const cfg = useCardFeeConfig();
  const cardOn = settlementMode !== 'direto' || directCardEnabled;
  const address = useDeliveryAddress();
  const picker = useAddressPicker();
  const { products, loading: productsLoading } = useProducts();
  const { stores, loading: storesLoading } = useStores();

  const [product, setProduct] = useState<any | null>(null);
  const [store, setStore] = useState<any | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [descExpanded, setDescExpanded] = useState(false);
  const [reviews, setReviews] = useState<ReviewsData>({ average: 0, count: 0, reviews: [] });
  const [barMode, setBarMode] = useState<'ssr' | 'mobile' | 'desktop'>('ssr');

  // Avaliações do produto (público).
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api.get(`/products/${id}/reviews`)
      .then((r) => { if (!cancelled) setReviews(r.data || { average: 0, count: 0, reviews: [] }); })
      .catch(() => { if (!cancelled) setReviews({ average: 0, count: 0, reviews: [] }); });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    setQuantity(1);
    setDescExpanded(false);
  }, [id]);

  // A barra de ação é fixa na viewport no mobile; o container de transição de página tem
  // transform/filter e quebraria o position:fixed, então no mobile ela vai por portal ao body.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') { setBarMode('mobile'); return; }
    const mq = window.matchMedia('(min-width: 900px)');
    const update = () => setBarMode(mq.matches ? 'desktop' : 'mobile');
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  /** Busca a loja isoladamente quando ela ainda não está no `useStores()`
   * local (ex.: produto veio pelo fallback direto da API). */
  const loadStoreById = useCallback(async (storeId?: string) => {
    if (!storeId) return;
    try {
      const res = await api.get(`/stores/${storeId}`);
      setStore(res.data);
    } catch (e) {
      console.error('Erro ao buscar loja:', e);
    }
  }, []);

  // Produto: por _id via useProducts() (sincronizado por socket). Só quando
  // a lista já terminou de sincronizar e o produto não está nela é que cai
  // no fallback GET /products/[id] — evita mostrar "não encontrado" cedo
  // demais, antes do primeiro fetch da lista completar.
  useEffect(() => {
    if (!id) return;

    const foundProduct = products.find((p: any) => p._id === id);
    if (foundProduct) {
      setProduct(foundProduct);
      setNotFound(false);
      setLoading(false);
      const foundStore = stores.find((s: any) => s._id === foundProduct.storeId);
      if (foundStore) setStore(keepStore(foundStore));
      else loadStoreById(foundProduct.storeId);
      return;
    }

    if (productsLoading) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/products/${id}`);
        if (cancelled) return;
        setProduct(res.data);
        setNotFound(false);
        const foundStore = stores.find((s: any) => s._id === res.data?.storeId);
        if (foundStore) setStore(keepStore(foundStore));
        else loadStoreById(res.data?.storeId);
      } catch (e) {
        console.error('Erro ao buscar produto:', e);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, products, stores, productsLoading, loadStoreById]);

  // Mantém a mesma referência quando a loja é a mesma: useStores() pode devolver cópias novas a cada render.
  const keepStore = (found: any) => (prev: any) => (prev && prev._id === found._id && prev.name === found.name ? prev : found);

  const relatedProducts = useMemo(() => {
    if (!product) return [];
    return products
      .filter((p: any) => p.storeId === product.storeId && p._id !== product._id)
      .slice(0, 4);
  }, [product, products]);

  const installment = useMemo(() => {
    if (!product || !cfg || !cardOn) return null;
    const opts = installmentOptions(Number(product.price), cfg);
    return opts.length ? opts[opts.length - 1] : null;
  }, [product, cfg, cardOn]);
  const { quotes, loading: quotesLoading } = useStoreQuotes(product ? [product.storeId] : [], address.point);
  const quote = product ? quotes[product.storeId] : undefined;
  const lines = deliveryStates({
    // Estado real do hook: cotação que falhou (429, rede) não fica em "Calculando…" ("Sem cotação: nada").
    quote: quote ?? null, loading: quotesLoading && !quote, hasPoint: !!address.point, address: address.label,
    onSetAddress: picker.request, onChangeAddress: picker.request,
  });

  const stock = Number(product?.quantity) || 0;
  const soldOut = stock <= 0;
  const lineTotal = (Number(product?.price) || 0) * quantity;

  // ---- Loading ----
  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingWrap}>
          <Skeleton height={360} radius={0} />
          <div className={styles.loadingBody}>
            <Skeleton width={100} height={11} radius={4} />
            <Skeleton width="72%" height={22} radius={6} />
            <Skeleton width="45%" height={30} radius={6} />
            <Skeleton height={72} radius={13} />
            <Skeleton height={48} radius={13} />
          </div>
        </div>
      </div>
    );
  }

  // ---- Não encontrado ----
  if (notFound || !product) {
    return (
      <div className={styles.page}>
        <div className={styles.notFoundWrap}>
          <EmptyState
            icon={<Package />}
            title="Produto não encontrado"
            description="Esse produto pode ter sido removido ou o link está incorreto."
            action={
              <Button variant="primary" onClick={() => router.push(ROUTES.buscar)}>Ver produtos</Button>
            }
          />
        </div>
      </div>
    );
  }


  const allImages: string[] = product.images?.length
    ? product.images
    : (product.image ? [product.image] : []);

  const actionBar = (
    <div className={styles.actionBar}>
      {soldOut ? (
        <Button variant="primary" disabled>Esgotado</Button>
      ) : (
        <>
          <QuantitySelector itemName={product.name} value={quantity} min={1} max={stock} onChange={setQuantity} />
          <Button
            variant="primary"
            onClick={() => {
              addToCart({
                productId: product._id,
                quantity,
                name: product.name,
                price: Number(product.price),
                storeId: product.storeId,
                storeName: store?.name,
                image: product.image,
              });
              setQuantity(1);
            }}
          >{`Adicionar · ${formatMoney(lineTotal)}`}</Button>
        </>
      )}
    </div>
  );

  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <div className={styles.media}>
          <ProductGallery images={allImages} name={product.name} className={styles.hero}>
            <span className={styles.backBtn}>
              <IconButton
                icon={<ArrowLeft size={20} strokeWidth={ICON_BUTTON_STROKE_WIDTH} aria-hidden="true" />}
                variant="onImage"
                aria-label="Voltar"
                onClick={() => goBack(router, ROUTES.inicio)}
              />
            </span>
            {soldOut && (
              <span className={styles.soldOutOverlay}>
                <span className={styles.soldOutPill}>Esgotado</span>
              </span>
            )}
          </ProductGallery>
        </div>

        {/* Breadcrumb só no desktop (spec §7.2) */}
        <nav className={styles.breadcrumb} aria-label="Navegação estrutural">
          <Link href={lojaHref(product.storeId)} className={styles.breadcrumbLink}>{store?.name || 'Loja'}</Link>
          <span className={styles.breadcrumbSep} aria-hidden="true">›</span>
          <span className={styles.breadcrumbCurrent}>{product.name}</span>
        </nav>

        <div className={styles.detail}>
          <section className={`${styles.info} ${styles.card}`}>
            <Link href={lojaHref(product.storeId)} className={styles.storeLink}>{`Vendido por ${store?.name || 'Loja'}${typeof store?.ratingAverage === 'number' ? ` · ★ ${formatRating(store.ratingAverage)}` : ''}`}</Link>
            <h1 className={styles.title}>{product.name}</h1>
            {reviews.count >= 3 && <Rating value={reviews.average} count={reviews.count} />}
            <PriceDisplay
              size="product"
              price={Number(product.price)}
              oldPrice={product.oldPrice != null ? Number(product.oldPrice) : null}
              installment={installment}
            />
          </section>

          <section className={styles.card} aria-labelledby="produto-entrega">
            <h2 id="produto-entrega" className={styles.srOnly}>Entrega</h2>
            <div className={styles.deliveryRow}>
              <span className={styles.deliveryIcon} aria-hidden="true"><Zap size={20} /></span>
              <div className={styles.deliveryText} aria-live="polite">
                {lines.map((l, i) => <DeliveryBadge key={i} state={l} />)}
                {address.selected && <p className={styles.deliveryWhere}>{`em ${address.label}`}</p>}
              </div>
              <DeliveryAddressControl trigger="link" address={address} picker={picker} storeId={product.storeId} storeName={store?.name} />
            </div>
          </section>

          {(product.description || product.tags?.length > 0) && (
          <section className={`${styles.info} ${styles.card}`}>
            {product.description && (
              <section className={styles.about}>
                <h2 className={styles.sectionTitle}>Sobre</h2>
                <HtmlContent
                  html={product.description}
                  className={[styles.descHtml, !descExpanded && styles.descClamped].filter(Boolean).join(' ')}
                />
                <button type="button" className={styles.descToggle} onClick={() => setDescExpanded((v) => !v)}>
                  {descExpanded ? 'Ver menos' : 'Ver mais'}
                </button>
              </section>
            )}

            {product.tags?.length > 0 && (
              <div className={styles.tagsList}>
                {product.tags.map((tag: string) => <Tag key={tag}>#{tag}</Tag>)}
              </div>
            )}
          </section>
          )}
          {barMode === 'desktop' && actionBar}
        </div>
      </div>

      {product.video && (
        <section className={styles.block}>
          <h2 className={styles.sectionTitle}>Vídeo do produto</h2>
          <video src={product.video} controls className={styles.videoPlayer} />
        </section>
      )}

      {reviews.count > 0 && reviews.reviews.length > 0 && (
        <section className={styles.block}>
          <h2 className={styles.sectionTitle}>Avaliações ({reviews.count})</h2>
          <div className={styles.reviewsList}>
            {reviews.reviews.map((r) => (
              <div key={r._id} className={styles.reviewItem}>
                <div className={styles.reviewHead}>
                  <span className={styles.reviewName}>{r.userName}</span>
                  <Rating value={r.rating} />
                </div>
                {r.comment && <p className={styles.reviewComment}>{r.comment}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {relatedProducts.length > 0 && (
        <section className={styles.block}>
          <h2 className={styles.sectionTitle}>Mais da loja</h2>
          <div className={styles.relatedRail}>
            {relatedProducts.map((p: any) => (
              <div key={p._id} className={styles.relatedItem} onClick={() => router.push(produtoHref(p._id))}>
                <ProductCard
                  variant="home"
                  product={productCardData(p, quote, { storeName: store?.name })}
                  soldOut={!(Number(p.quantity) > 0)}
                  onAdd={() => addToCart({ productId: p._id, quantity: 1, name: p.name, price: Number(p.price), storeId: p.storeId, storeName: store?.name, image: p.image })}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {barMode === 'mobile' && createPortal(actionBar, document.body)}
    </main>
  );
}
