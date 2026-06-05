import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useStores } from '../hooks/useSync';
import { imageUrl } from '../lib/config';
import Icon from '../components/Icon';
import styles from './Stores.module.css';

type Store = {
  _id: string;
  name: string;
  slug?: string;
  description?: string;
  address?: string;
  cnpj?: string;
  plan?: number;
  featuredBannerUrl?: string;
  coverBannerUrl?: string;
};

const INITIAL_COUNT = 6;

export default function StoresPage() {
  const { stores, loading } = useStores();
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);

  const sorted = useMemo(() =>
    [...stores].sort((a: Store, b: Store) => (b.plan ?? 1) - (a.plan ?? 1)),
    [stores]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter((s: Store) =>
      s.name.toLowerCase().includes(q) || s.address?.toLowerCase().includes(q)
    );
  }, [sorted, search]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const storeHref = (s: Store) => `/stores/${s.slug || s._id}`;
  const storeBanner = (s: Store) => s.coverBannerUrl || s.featuredBannerUrl;
  const storeInitials = (name: string) => name.slice(0, 2).toUpperCase();

  const featured = visible.slice(0, 2) as Store[];
  const gridStores = visible.slice(2) as Store[];

  return (
    <div className={styles.page}>
      {/* Hero Header */}
      <header className={styles.heroHeader}>
        <div className={styles.headerLabel}>Diretório de Lojas</div>
        <h1 className={styles.heroTitle}>
          LOJAS<br />PARCEIRAS
        </h1>
        <p className={styles.heroDesc}>
          {loading
            ? 'Carregando lojas...'
            : `${stores.length} estabelecimento${stores.length !== 1 ? 's' : ''} selecionado${stores.length !== 1 ? 's' : ''} pela curadoria DROP. Cada loja é única na sua proposta e qualidade.`
          }
        </p>
      </header>

      {/* Search */}
      <div className={styles.searchSection}>
        <div className={styles.searchBar}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Buscar por nome ou endereço..."
            value={search}
            onChange={e => { setSearch(e.target.value); setVisibleCount(INITIAL_COUNT); }}
          />
          <button className={styles.searchBtn}>BUSCAR</button>
        </div>
      </div>

      {/* Store Entries */}
      <div className={styles.storeList}>
        {!loading && filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><Icon name="store" size={40} /></div>
            <p className={styles.emptyText}>
              Nenhuma loja encontrada{search ? ` para "${search}"` : ''}
            </p>
          </div>
        ) : (
          <div className={styles.storeEntries}>
            {/* Featured stores — asymmetric editorial layout */}
            {featured.map((store, idx) => {
              const isLeft = idx % 2 === 0;
              const banner = storeBanner(store);
              return (
                <section key={store._id} className={styles.storeEntry}>
                  <div className={isLeft ? styles.storeImageBlockLeft : styles.storeImageBlockRight}>
                    {store.plan === 3 && (
                      <div className={styles.premiumBadge}>
                        <Icon name="crown" size={12} /> Premium
                      </div>
                    )}
                    <div className={styles.storeImageWrap}>
                      {banner ? (
                        <img src={imageUrl(banner)} alt={store.name} className={styles.storeImage} />
                      ) : (
                        <div className={styles.storePlaceholder}>{storeInitials(store.name)}</div>
                      )}
                    </div>

                    <div className={isLeft ? styles.storeInfoCardLeft : styles.storeInfoCardRight}>
                      <div className={styles.storeInfoHeader}>
                        <div className={idx === 0 ? styles.storeAvatar : styles.storeAvatarAlt}>
                          {storeInitials(store.name)}
                        </div>
                        <h3 className={styles.storeInfoName}>{store.name.toUpperCase()}</h3>
                      </div>
                      <p className={styles.storeInfoDesc}>
                        {store.description || store.address || 'Loja parceira da plataforma DROP.'}
                      </p>
                      <Link href={storeHref(store)} className={idx === 0 ? styles.storeInfoBtn : styles.storeInfoBtnAlt}>
                        Visitar Loja
                      </Link>
                    </div>
                  </div>
                </section>
              );
            })}

            {/* Grid pair stores */}
            {gridStores.length > 0 && (
              <div className={styles.gridPair}>
                <div>
                  {gridStores.filter((_, i) => i % 2 === 0).map((store) => {
                    const banner = storeBanner(store);
                    return (
                      <Link key={store._id} href={storeHref(store)} className={styles.gridCard}>
                        <div className={styles.gridCardImageWrap}>
                          {banner ? (
                            <img src={imageUrl(banner)} alt={store.name} className={styles.gridCardImage} />
                          ) : (
                            <div className={styles.storePlaceholder}>{storeInitials(store.name)}</div>
                          )}
                        </div>
                        <h3 className={styles.gridCardName}>{store.name.toUpperCase()}</h3>
                        <p className={styles.gridCardMeta}>
                          {store.address || 'Loja DROP'}
                        </p>
                        <span className={styles.gridCardLink}>EXPLORAR LOJA</span>
                      </Link>
                    );
                  })}
                </div>
                <div className={styles.gridPairRight}>
                  {gridStores.filter((_, i) => i % 2 === 1).map((store) => {
                    const banner = storeBanner(store);
                    return (
                      <Link key={store._id} href={storeHref(store)} className={styles.gridCard}>
                        <div className={styles.gridCardImageWrap}>
                          {banner ? (
                            <img src={imageUrl(banner)} alt={store.name} className={styles.gridCardImage} />
                          ) : (
                            <div className={styles.storePlaceholder}>{storeInitials(store.name)}</div>
                          )}
                        </div>
                        <h3 className={styles.gridCardName}>{store.name.toUpperCase()}</h3>
                        <p className={styles.gridCardMeta}>
                          {store.address || 'Loja DROP'}
                        </p>
                        <span className={styles.gridCardLink}>EXPLORAR LOJA</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Load More */}
        {hasMore && (
          <div className={styles.loadMore}>
            <div className={styles.loadMoreDivider} />
            <button className={styles.loadMoreText} onClick={() => setVisibleCount(c => c + 6)}>
              Carregar Mais Lojas
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
