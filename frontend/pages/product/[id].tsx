import { useRouter } from 'next/router';
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Minus, Package, Plus } from 'lucide-react';

import api from '../../lib/api';
import { useCart } from '../../contexts/CartContext';
import { imageUrl } from '../../lib/config';
import { useProducts, useStores } from '../../hooks/useSync';

import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Tag } from '../../components/ui/Tag';
import { PriceTag } from '../../components/ui/PriceTag';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ICON_STROKE_WIDTH, ICON_BUTTON_STROKE_WIDTH } from '../../components/ui/Icon';
import { ProductCard } from '../../components/drop/ProductCard';
import { StickyCart } from '../../components/drop/StickyCart';
import { TabBar, TabKey } from '../../components/drop/TabBar';
import HtmlContent from '../../components/HtmlContent';

import styles from './ProductDetail.module.css';

const TAB_ROUTES: Record<TabKey, string> = {
  inicio: '/inicio',
  buscar: '/',
  pedidos: '/user-dashboard',
  carteira: '/wallet',
  perfil: '/minha-conta',
};

/** Quanto tempo o CTA mostra "Adicionado!" antes de voltar ao rótulo normal. */
const ADDED_FEEDBACK_MS = 1600;

/** Estoque de um relacionado → estado visual do ProductCard (mesma regra
 * usada na página da loja): esgotado cobre a imagem, estoque baixo (<=3)
 * ganha um rótulo discreto, estoque farto não ganha rótulo (nada inventado). */
function getStockState(quantity: number): { soldOut: boolean; stockLabel?: string } {
  if (quantity <= 0) return { soldOut: true };
  if (quantity <= 3) return { soldOut: false, stockLabel: `Restam ${quantity}` };
  return { soldOut: false };
}

export default function ProductPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { cart, add } = useCart();
  const { products, loading: productsLoading } = useProducts();
  const { stores, loading: storesLoading } = useStores();

  const [product, setProduct] = useState<any | null>(null);
  const [store, setStore] = useState<any | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const addedTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setActiveImageIdx(0);
    setQuantity(1);
    setDescExpanded(false);
  }, [id]);

  useEffect(() => () => clearTimeout(addedTimeoutRef.current), []);

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
      if (foundStore) setStore(foundStore);
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
        if (foundStore) setStore(foundStore);
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

  const relatedProducts = useMemo(() => {
    if (!product) return [];
    return products
      .filter((p: any) => p.storeId === product.storeId && p._id !== product._id)
      .slice(0, 4);
  }, [product, products]);

  const cartCount = (cart || []).reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);
  const cartTotal = (cart || []).reduce((sum: number, c: any) => sum + (c.price || 0) * (c.quantity || 0), 0);

  const handleTabNavigate = (key: TabKey) => router.push(TAB_ROUTES[key]);

  const stock = Number(product?.quantity) || 0;
  const isOutOfStock = stock <= 0;

  const decrementQty = () => setQuantity((q) => Math.max(1, q - 1));
  const incrementQty = () => setQuantity((q) => Math.min(stock, q + 1));
  const handleQtyInput = (e: ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (Number.isNaN(val)) return;
    setQuantity(Math.max(1, Math.min(stock, val)));
  };

  const handleAddToCart = () => {
    if (!product || isOutOfStock) return;
    add({
      productId: product._id,
      quantity,
      name: product.name,
      price: product.price,
      storeId: product.storeId,
    });
    setQuantity(1);
    setJustAdded(true);
    clearTimeout(addedTimeoutRef.current);
    addedTimeoutRef.current = setTimeout(() => setJustAdded(false), ADDED_FEEDBACK_MS);
  };

  const addRelatedToCart = (p: any) => {
    add({ productId: p._id, quantity: 1, name: p.name, price: p.price, storeId: p.storeId });
  };

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
              <Button variant="primary" onClick={() => router.push('/')}>Ver produtos</Button>
            }
          />
        </div>
      </div>
    );
  }

  const allImages: string[] = product.images?.length
    ? product.images
    : (product.image ? [product.image] : []);
  const safeIdx = Math.min(activeImageIdx, Math.max(0, allImages.length - 1));
  const heroImageUrl = allImages.length ? imageUrl(allImages[safeIdx]) : '';

  return (
    <div className={styles.page}>
      {/* Galeria */}
      <section className={styles.hero} aria-label={`Foto de ${product.name}`}>
        <span
          className={styles.heroImage}
          style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}
          aria-hidden="true"
        >
          {!heroImageUrl && <Package size={40} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}
        </span>
        <span className={styles.heroTopScrim} aria-hidden="true" />

        <span className={styles.backBtn}>
          <IconButton
            icon={<ArrowLeft size={18} strokeWidth={ICON_BUTTON_STROKE_WIDTH} aria-hidden="true" />}
            variant="onImage"
            aria-label="Voltar"
            onClick={() => router.back()}
          />
        </span>

        {isOutOfStock && (
          <span className={styles.outOfStockOverlay}>
            <span className={styles.outOfStockPill}>Fora de estoque</span>
          </span>
        )}
      </section>

      {allImages.length > 1 && (
        <div className={styles.thumbsRow}>
          {allImages.map((img: string, idx: number) => (
            <button
              key={img + idx}
              type="button"
              className={[styles.thumb, idx === safeIdx && styles.thumbActive].filter(Boolean).join(' ')}
              onClick={() => setActiveImageIdx(idx)}
              aria-label={`Ver foto ${idx + 1} de ${product.name}`}
              aria-pressed={idx === safeIdx}
            >
              <img src={imageUrl(img)} alt="" />
            </button>
          ))}
        </div>
      )}

      {/* Breadcrumb */}
      <nav className={styles.breadcrumb} aria-label="Navegação estrutural">
        <Link href="/" className={styles.breadcrumbLink}>Produtos</Link>
        {store && (
          <>
            <span className={styles.breadcrumbSep} aria-hidden="true">/</span>
            <Link href={`/stores/${product.storeId}`} className={styles.breadcrumbLink}>
              {store.name}
            </Link>
          </>
        )}
        <span className={styles.breadcrumbSep} aria-hidden="true">/</span>
        <span className={styles.breadcrumbCurrent}>{product.name}</span>
      </nav>

      {/* Informações */}
      <section className={styles.info}>
        {product.category && <Tag>{product.category}</Tag>}

        <h1 className={styles.title}>{product.name}</h1>

        {product.description && (
          <div className={styles.descWrapper}>
            <HtmlContent
              html={product.description}
              className={[styles.descHtml, !descExpanded && styles.descClamped].filter(Boolean).join(' ')}
            />
            <button type="button" className={styles.descToggle} onClick={() => setDescExpanded((v) => !v)}>
              {descExpanded ? 'Ver menos ↑' : 'Ver mais ↓'}
            </button>
          </div>
        )}

        <div className={styles.priceRow}>
          <PriceTag price={Number(product.price)} size="md" />
        </div>

        <div className={[styles.stockRow, isOutOfStock ? styles.stockOut : styles.stockIn].join(' ')}>
          <span className={styles.stockDot} aria-hidden="true" />
          {isOutOfStock ? 'Fora de estoque' : `${stock} unidade${stock === 1 ? '' : 's'} em estoque`}
        </div>

        {!isOutOfStock && (
          <div className={styles.qtySection}>
            <span className={styles.qtyLabel}>Quantidade</span>
            <div className={styles.qtyRow}>
              <IconButton
                icon={<Minus size={15} strokeWidth={ICON_BUTTON_STROKE_WIDTH} aria-hidden="true" />}
                variant="soft"
                aria-label="Diminuir quantidade"
                onClick={decrementQty}
                disabled={quantity <= 1}
              />
              <input
                type="number"
                inputMode="numeric"
                className={styles.qtyInput}
                value={quantity}
                min={1}
                max={stock}
                onChange={handleQtyInput}
                aria-label="Quantidade"
              />
              <IconButton
                icon={<Plus size={15} strokeWidth={ICON_BUTTON_STROKE_WIDTH} aria-hidden="true" />}
                variant="soft"
                aria-label="Aumentar quantidade"
                onClick={incrementQty}
                disabled={quantity >= stock}
              />
            </div>
          </div>
        )}

        <div className={styles.ctas}>
          <Button
            variant="primary"
            className={styles.ctaFull}
            disabled={isOutOfStock}
            leftIcon={justAdded ? <Check size={17} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" /> : undefined}
            onClick={handleAddToCart}
          >
            {isOutOfStock ? 'Indisponível' : justAdded ? 'Adicionado!' : 'Adicionar ao Carrinho'}
          </Button>

          {store && (
            <Button
              variant="ghost"
              className={styles.ctaFull}
              onClick={() => router.push(`/stores/${product.storeId}`)}
            >
              Visitar Loja: {store.name}
            </Button>
          )}
        </div>

        {product.tags?.length > 0 && (
          <div className={styles.tagsSection}>
            <span className={styles.tagsLabel}>Tags</span>
            <div className={styles.tagsList}>
              {product.tags.map((tag: string) => <Tag key={tag}>#{tag}</Tag>)}
            </div>
          </div>
        )}
      </section>

      {/* Vídeo */}
      {product.video && (
        <section className={styles.videoSection}>
          <h2 className={styles.sectionTitle}>Vídeo do Produto</h2>
          <video src={product.video} controls className={styles.videoPlayer} />
        </section>
      )}

      {/* Mais da loja */}
      {relatedProducts.length > 0 && (
        <section className={styles.relatedSection}>
          <h2 className={styles.sectionTitle}>Mais da Loja</h2>
          <div className={styles.relatedRail}>
            {relatedProducts.map((p: any) => {
              const relStock = getStockState(Number(p.quantity) || 0);
              return (
                <div
                  key={p._id}
                  className={styles.relatedItem}
                  onClick={() => router.push(`/product/${p._id}`)}
                >
                  <ProductCard
                    variant="recomendado"
                    product={{ name: p.name, imageUrl: imageUrl(p.image) || undefined, price: Number(p.price) }}
                    soldOut={relStock.soldOut}
                    stockLabel={relStock.stockLabel}
                    onAdd={(e?: any) => { e?.stopPropagation?.(); addRelatedToCart(p); }}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {cartCount > 0 && (
        <StickyCart count={cartCount} total={cartTotal} onOpen={() => router.push('/checkout')} />
      )}

      <div className={styles.tabBarWrap}>
        <TabBar active="buscar" onNavigate={handleTabNavigate} />
      </div>
    </div>
  );
}
