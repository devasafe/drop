import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useProducts } from '../hooks/useSync';
import { imageUrl } from '../lib/config';
import Icon from '../components/Icon';
import styles from './Inicio.module.css';

type Product = {
  _id: string;
  name: string;
  price: number;
  image?: string;
  storeId?: string;
  storeName?: string;
};

export default function Inicio() {
  const { products } = useProducts();
  const [stats, setStats] = useState({ stores: 0, products: 0, deliveries: 0 });

  useEffect(() => {
    if (products.length > 0) {
      const uniqueStores = new Set(products.map((p: Product) => p.storeId)).size;
      setStats({ stores: uniqueStores, products: products.length, deliveries: Math.floor(products.length * 2.4) });
    }
  }, [products]);

  const featured = products[0] as Product | undefined;
  const secondary = products.slice(1, 3) as Product[];

  return (
    <div>
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroBg}>
          {featured?.image && (
            <img src={imageUrl(featured.image)} alt="" className={styles.heroBgImage} />
          )}
          <div className={styles.heroBgGradient} />
        </div>

        <div className={styles.heroContent}>
          <span className={styles.heroBadge}>Marketplace &amp; Delivery</span>
          <h1 className={styles.heroTitle}>
            Compre local,{' '}
            <span className={styles.heroTitleAccent}>receba rápido</span>
          </h1>
          <p className={styles.heroDesc}>
            Produtos das melhores lojas da sua região entregues na sua porta. Explore, compre e acompanhe tudo em tempo real.
          </p>
          <div className={styles.heroActions}>
            <Link href="/register" className={styles.btnPrimary}>
              <Icon name="zap" size={16} />
              Criar Conta Grátis
            </Link>
            <Link href="/" className={styles.btnSecondary}>
              <Icon name="shopping-bag" size={16} />
              Ver Produtos
            </Link>
          </div>
        </div>

        <div className={styles.statsBar}>
          <div className={styles.statItem}>
            <div className={styles.statValue}>{stats.stores + 17 || '—'}</div>
            <div className={styles.statLabel}>Lojas</div>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statItem}>
            <div className={styles.statValue}>{stats.products || '—'}</div>
            <div className={styles.statLabel}>Produtos</div>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statItem}>
            <div className={styles.statValue}>{stats.deliveries + 126 || '—'}</div>
            <div className={styles.statLabel}>Entregas</div>
          </div>
        </div>
      </section>

      {/* Products */}
      <section className={styles.productsSection}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Em Destaque</h2>
            <p className={styles.sectionDesc}>Produtos selecionados das lojas da plataforma</p>
          </div>
          <Link href="/" className={styles.sectionLink}>VER TODOS</Link>
        </div>

        <div className={styles.productGrid}>
          {/* Featured card */}
          {featured && (
            <Link href={`/product/${featured._id}`} className={styles.featureCard}>
              <div className={styles.cardImageWrap}>
                <img src={imageUrl(featured.image)} alt={featured.name} />
                <span className={styles.cardBadge}>DESTAQUE</span>
              </div>
              <div className={styles.cardInfo}>
                <div>
                  <h3 className={styles.cardName}>{featured.name}</h3>
                  <p className={styles.cardStore}>{featured.storeName || 'Loja DROP'}</p>
                </div>
                <span className={styles.cardPrice}>
                  R$ {featured.price.toFixed(2).replace('.', ',')}
                </span>
              </div>
            </Link>
          )}

          {/* Secondary cards */}
          <div className={styles.secondaryCards}>
            {secondary.map((p) => (
              <Link key={p._id} href={`/product/${p._id}`} className={styles.secondaryCard}>
                <div className={styles.secondaryImageWrap}>
                  <img src={imageUrl(p.image)} alt={p.name} />
                </div>
                <div className={styles.cardInfo}>
                  <div>
                    <h3 className={styles.cardName}>{p.name}</h3>
                    <p className={styles.cardStore}>{p.storeName || 'Loja DROP'}</p>
                  </div>
                  <span className={styles.cardPrice}>
                    R$ {p.price.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Watermark */}
      <div className={styles.watermark}>
        <div className={styles.watermarkText}>DROP</div>
      </div>

      {/* Bento */}
      <section className={styles.bentoSection}>
        <div className={styles.bentoGrid}>
          <div className={styles.bentoBig}>
            {featured?.image && (
              <img src={imageUrl(featured.image)} alt="" className={styles.bentoBigBg} />
            )}
            <div className={styles.bentoBigContent}>
              <h3 className={styles.bentoBigTitle}>Lojas perto de você</h3>
              <p className={styles.bentoBigDesc}>
                Descubra estabelecimentos na sua região com entrega rápida. Apoie o comércio local.
              </p>
              <Link href="/stores" className={styles.bentoBigLink}>
                EXPLORAR LOJAS →
              </Link>
            </div>
          </div>

          <div className={styles.bentoSmall}>
            <div className={styles.bentoIcon}>
              <Icon name="zap" size={24} />
            </div>
            <h3 className={styles.bentoSmallTitle}>Entrega Express</h3>
            <p className={styles.bentoSmallDesc}>
              Motoboys dedicados levam seu pedido o mais rápido possível, com rastreamento ao vivo.
            </p>
            <Link href="/register" className={styles.bentoSmallBtn}>
              COMEÇAR AGORA
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
