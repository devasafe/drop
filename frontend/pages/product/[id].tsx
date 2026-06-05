import { useRouter } from 'next/router';
import { useEffect, useState, useMemo } from 'react';
import api from '../../lib/api';
import { useCart } from '../../contexts/CartContext';
import Link from 'next/link';
import { imageUrl } from '../../lib/config';
import { useProducts, useStores } from '../../hooks/useSync';
import styles from './ProductDetail.module.css';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import HtmlContent from '../../components/HtmlContent';

export default function ProductPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const [product, setProduct] = useState<any | null>(null);
  const [store, setStore] = useState<any | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);
  const { add } = useCart();
  const { products } = useProducts();
  const { stores } = useStores();

  useEffect(() => { setActiveImageIdx(0); }, [id]);

  useEffect(() => {
    if (!id || products.length === 0) return;
    const foundProduct = products.find(p => p._id === id);
    if (foundProduct) {
      setProduct(foundProduct);
      const foundStore = stores.find(s => s._id === foundProduct.storeId);
      if (foundStore) setStore(foundStore);
      setLoading(false);
    } else if (!loading) {
      (async () => {
        try {
          const res = await api.get(`/products/${id}`);
          setProduct(res.data);
          if (res.data.storeId) {
            try {
              const storeRes = await api.get(`/stores/${res.data.storeId}`);
              setStore(storeRes.data);
            } catch (e) { console.error('Error fetching store:', e); }
          }
          setLoading(false);
        } catch (e) { console.error(e); setLoading(false); }
      })();
    }
  }, [id, products, stores, loading]);

  const relatedProducts = useMemo(() => {
    if (!product || products.length === 0) return [];
    return products.filter((p: any) => p.storeId === product.storeId && p._id !== product._id).slice(0, 4);
  }, [product, products]);

  const addToCart = () => {
    if (!product) return;
    add({ productId: product._id, quantity, name: product.name, price: product.price, storeId: product.storeId });
    alert(`${quantity} unidade(s) adicionada(s) ao carrinho!`);
    setQuantity(1);
  };

  if (loading) {
    return (
      <div className={styles.centered}>
        <LoadingSkeleton variant="detail" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className={styles.centered}>
        <div className={styles.notFoundIcon}><Icon name="package" size={32} /></div>
        <h2 className={styles.notFoundTitle}>Produto não encontrado</h2>
        <Link href="/" className={styles.notFoundLink}>← Voltar aos Produtos</Link>
      </div>
    );
  }

  const allImages: string[] = product.images?.length
    ? product.images
    : (product.image ? [product.image] : []);
  const safeIdx = Math.min(activeImageIdx, Math.max(0, allImages.length - 1));

  return (
    <div className={styles.page}>
      <div className={styles.container}>

        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <Link href="/" className={styles.breadcrumbLink}>Produtos</Link>
          <span className={styles.breadcrumbSep}>/</span>
          {store && (
            <>
              <Link href={`/stores/${product.storeId}`} className={styles.breadcrumbLink}>
                {store.name}
              </Link>
              <span className={styles.breadcrumbSep}>/</span>
            </>
          )}
          <span className={styles.breadcrumbCurrent}>{product.name}</span>
        </div>

        {/* Main card */}
        <div className={styles.mainCard}>
          <div className={styles.mainGrid}>

            {/* Image Gallery */}
            <div className={styles.galleryBox}>
              <div className={styles.galleryMain}>
                {allImages.length > 0 ? (
                  <img src={imageUrl(allImages[safeIdx])} alt={product.name} className={styles.productImage} />
                ) : (
                  <div className={styles.imagePlaceholder}><Icon name="package" size={48} /></div>
                )}
                {product.quantity <= 0 && (
                  <div className={styles.outOfStockOverlay}>
                    <span className={styles.outOfStockBadge}>Fora de estoque</span>
                  </div>
                )}
              </div>
              {allImages.length > 1 && (
                <div className={styles.galleryThumbs}>
                  {allImages.map((img: string, idx: number) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveImageIdx(idx)}
                      className={`${styles.galleryThumb} ${idx === safeIdx ? styles.galleryThumbActive : ''}`}
                    >
                      <img src={imageUrl(img)} alt={`Foto ${idx + 1}`} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Info */}
            <div className={styles.infoBox}>
              {product.category && (
                <div className={styles.categoryBadge}>{product.category}</div>
              )}

              <h1 className={styles.productTitle}>{product.name}</h1>

              {product.description && (
                <div className={styles.descWrapper}>
                  <HtmlContent
                    html={product.description}
                    className={`${styles.productDescHtml} ${!descExpanded ? styles.productDescClamped : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setDescExpanded(v => !v)}
                    className={styles.descToggle}
                  >
                    {descExpanded ? 'Ver menos ↑' : 'Ver mais ↓'}
                  </button>
                </div>
              )}

              {/* Price block */}
              <div className={styles.priceBlock}>
                <span className={styles.priceCurrency}>R$</span>
                <span className={styles.priceValue}>{product.price.toFixed(2)}</span>
              </div>

              {/* Stock */}
              <div className={styles.stockRow}>
                <span className={`${styles.stockDot} ${product.quantity > 0 ? styles.stockDotIn : styles.stockDotOut}`} />
                <span className={product.quantity > 0 ? styles.stockTextIn : styles.stockTextOut}>
                  {product.quantity > 0 ? `${product.quantity} unidade(s) em estoque` : 'Fora de estoque'}
                </span>
              </div>

              {/* Quantity */}
              {product.quantity > 0 && (
                <div className={styles.qtySection}>
                  <label className={styles.qtyLabel}>Quantidade</label>
                  <div className={styles.qtyRow}>
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className={styles.qtyBtn}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Math.min(product.quantity, parseInt(e.target.value) || 1)))}
                      className={styles.qtyInput}
                    />
                    <button
                      onClick={() => setQuantity(Math.min(product.quantity, quantity + 1))}
                      className={styles.qtyBtn}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {/* CTA Buttons */}
              <div className={styles.ctaButtons}>
                <button
                  onClick={addToCart}
                  disabled={product.quantity <= 0}
                  className={styles.btnAddToCart}
                >
                  {product.quantity <= 0 ? 'Indisponível' : 'Adicionar ao Carrinho'}
                </button>

                {store && (
                  <Link href={`/stores/${product.storeId}`} className={styles.btnVisitStore}>
                    Visitar Loja: {store.name}
                  </Link>
                )}
              </div>

              {/* Tags */}
              {product.tags && product.tags.length > 0 && (
                <div className={styles.tagsSection}>
                  <div className={styles.tagsLabel}>Tags</div>
                  <div className={styles.tagsList}>
                    {product.tags.map((tag: string) => (
                      <span key={tag} className={styles.tag}>#{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Video section */}
        {product.video && (
          <div className={styles.videoSection}>
            <h2 className={styles.videoTitle}>Vídeo do Produto</h2>
            <video src={product.video} controls className={styles.videoPlayer} />
          </div>
        )}

        {/* Related products */}
        {relatedProducts.length > 0 && (
          <div className={styles.relatedSection}>
            <h2 className={styles.relatedTitle}>Mais da Loja</h2>
            <div className={styles.relatedGrid}>
              {relatedProducts.map((p) => (
                <Link key={p._id} href={`/product/${p._id}`} className={styles.relatedLink}>
                  <div className={styles.relatedCard}>
                    <div className={styles.relatedImageBox}>
                      {p.image ? (
                        <img src={imageUrl(p.image)} alt={p.name} className={styles.relatedImage} />
                      ) : (
                        <span className={styles.relatedPlaceholder}><Icon name="package" size={24} /></span>
                      )}
                    </div>
                    <div className={styles.relatedBody}>
                      <h3 className={styles.relatedName}>{p.name}</h3>
                      <div className={styles.relatedPrice}>R$ {p.price.toFixed(2)}</div>
                      <div className={p.quantity > 0 ? styles.relatedStockIn : styles.relatedStockOut}>
                        {p.quantity > 0 ? 'Em estoque' : 'Fora de estoque'}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
