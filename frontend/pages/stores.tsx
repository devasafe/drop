import { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { ArrowLeft, Store as StoreIcon } from 'lucide-react';

import { useStores, useFeaturedStores } from '../hooks/useSync';
import { imageUrl } from '../lib/config';

import { SearchField } from '../components/ui/SearchField';
import { IconButton } from '../components/ui/IconButton';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { StoreCard, StoreCardData } from '../components/drop/StoreCard';
import { PremiumCarousel } from '../components/drop/PremiumCarousel';
import { ICON_BUTTON_STROKE_WIDTH } from '../components/ui/Icon';

import styles from './Stores.module.css';

interface Store {
  _id: string;
  name: string;
  slug?: string;
  description?: string;
  address?: string;
  plan?: number;
  featuredBannerUrl?: string;
  coverBannerUrl?: string;
  isOpen?: boolean;
  categories?: Array<{ name: string }>;
}

const INITIAL_COUNT = 6;
const LOAD_MORE_STEP = 6;

/** Loja → StoreCardData. Sem rating/eta/frete reais no backend hoje (ver
 * StoreCard.tsx) — ficam de fora, nunca um valor inventado. */
function mapStore(store: Store): StoreCardData {
  return {
    name: store.name,
    imageUrl: imageUrl(store.coverBannerUrl || store.featuredBannerUrl, { w: 1000 }) || undefined,
    status: store.isOpen ? 'aberta' : 'fechada',
    category: store.categories?.[0]?.name || store.address || 'Loja DROP',
  };
}

export default function StoresPage() {
  const router = useRouter();
  const { stores, loading } = useStores();
  const { stores: featuredStores } = useFeaturedStores();
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setVisibleCount(INITIAL_COUNT);
  };

  // Plano 3 primeiro — destaque premium sempre na frente da lista.
  const sorted = useMemo(
    () => [...stores].sort((a: Store, b: Store) => (b.plan ?? 1) - (a.plan ?? 1)),
    [stores]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(
      (s: Store) =>
        s.name.toLowerCase().includes(q) || s.address?.toLowerCase().includes(q)
    );
  }, [sorted, search]);

  const visible = filtered.slice(0, visibleCount) as Store[];
  const hasMore = visibleCount < filtered.length;

  // Banners do carrossel: lojas premium (Plano 3 com featuredBannerUrl).
  const featuredItems = useMemo(
    () => (featuredStores as Store[]).map((s) => ({ id: s._id, store: mapStore(s) })),
    [featuredStores]
  );

  const storeHref = (s: Store) => `/stores/${s.slug || s._id}`;

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div className={styles.headerRow}>
          <IconButton
            icon={<ArrowLeft size={18} strokeWidth={ICON_BUTTON_STROKE_WIDTH} aria-hidden="true" />}
            variant="soft"
            aria-label="Voltar"
            onClick={() => router.back()}
          />
          <div className={styles.headerText}>
            <h1 className={styles.title}>Lojas</h1>
            <p className={styles.subtitle}>
              {loading
                ? 'Carregando lojas…'
                : `${filtered.length} loja${filtered.length !== 1 ? 's' : ''}${search ? ` para "${search}"` : ' disponíveis'}`}
            </p>
          </div>
        </div>

        <div className={styles.searchRow}>
          <SearchField
            value={search}
            onChange={handleSearchChange}
            placeholder="Buscar por nome ou endereço…"
          />
        </div>
      </header>

      <section className={styles.section}>
        {loading ? (
          <div className={styles.skeletonStack}>
            <Skeleton height={130} radius={20} />
            <Skeleton height={58} radius={14} />
            <Skeleton height={58} radius={14} />
            <Skeleton height={58} radius={14} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<StoreIcon />}
            title="Nenhuma loja encontrada"
            description={
              search
                ? `Não encontramos lojas para "${search}". Tente outro nome ou endereço.`
                : 'Ainda não há lojas cadastradas na plataforma.'
            }
          />
        ) : (
          <>
            {featuredItems.length > 0 && !search.trim() && (
              <div className={styles.carouselWrap}>
                <PremiumCarousel
                  items={featuredItems}
                  onSelect={(id) => router.push(`/stores/${id}`)}
                />
              </div>
            )}

            <div className={styles.rows}>
              {visible.map((store) => (
                <StoreCard
                  key={store._id}
                  variant="resultado"
                  store={mapStore(store)}
                  onClick={() => router.push(storeHref(store))}
                />
              ))}
            </div>
          </>
        )}

        {hasMore && (
          <button
            type="button"
            className={styles.loadMore}
            onClick={() => setVisibleCount((c) => c + LOAD_MORE_STEP)}
          >
            Carregar mais lojas
          </button>
        )}
      </section>
    </div>
  );
}
