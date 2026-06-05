import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '../lib/api';
import { imageUrl } from '../lib/config';
import Icon from './Icon';
import styles from './BannerCarousel.module.css';

interface FeaturedStore {
  _id: string;
  name: string;
  featuredBannerUrl: string;
  plan: number;
}

export default function BannerCarousel() {
  const [stores, setStores] = useState<FeaturedStore[]>([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.get('/stores/featured')
      .then(({ data }) => { if (!cancelled) setStores(Array.isArray(data) ? data : []) })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Auto-rotate a cada 4s
  useEffect(() => {
    if (stores.length <= 1) return;
    const timer = setInterval(() => {
      setCurrent(prev => (prev + 1) % stores.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [stores.length]);

  if (stores.length === 0) return null;

  return (
    <div className={styles.carousel}>
      {stores.map((store, idx) => (
        <div
          key={store._id}
          className={`${styles.slide} ${idx === current ? styles.slideActive : ''}`}
          aria-hidden={idx !== current}
        >
          <img
            src={imageUrl(store.featuredBannerUrl)}
            alt={`Banner de ${store.name}`}
            className={styles.bannerImg}
          />
          <div className={styles.overlay}>
            <span className={styles.premiumBadge}><Icon name="crown" size={14} /> Premium</span>
            <div className={styles.storeName}>{store.name}</div>
            <Link href={`/stores/${store._id}`} className={styles.ctaBtn}>
              Ver Loja →
            </Link>
          </div>
        </div>
      ))}

      {stores.length > 1 && (
        <div className={styles.dots}>
          {stores.map((_, idx) => (
            <button
              key={idx}
              className={`${styles.dot} ${idx === current ? styles.dotActive : ''}`}
              onClick={() => setCurrent(idx)}
              aria-label={`Ir para loja ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
