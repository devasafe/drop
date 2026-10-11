import { useMemo } from 'react';
import { useRouter } from 'next/router';
import { Bell, Search, Store as StoreIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useStores, useFeaturedStores, usePromoBanners, useNotifications } from '../hooks/useSync';
import { useActiveOrders } from '../hooks/useActiveOrders';
import { useDeliveryAddress } from '../hooks/useDeliveryAddress';
import { useAddressPicker } from '../hooks/useAddressPicker';
import { useStoreQuotes } from '../hooks/useStoreQuotes';
import { useOffers, useNearbyStores } from '../hooks/useCatalogHome';
import { useAddToCart } from '../hooks/useAddToCart';
import { imageUrl } from '../lib/config';
import { mapStore } from '../lib/mapStore';
import { repeatItems } from '../lib/repeatItems';
import { productCardData } from '../lib/catalogCards';
import { deliveryStates } from '../lib/deliveryView';
import { ROUTES, buscarHref, lojaHref, produtoHref, pedidoHref } from '../lib/routes';
import { DeliveryAddressControl } from '../components/drop/DeliveryAddressControl';
import { DeliveryBadge } from '../components/drop/DeliveryBadge';
import { ActiveOrdersSection } from '../components/drop/ActiveOrdersSection';
import { Banner } from '../components/drop/Banner';
import { ProductCard } from '../components/drop/ProductCard';
import { StoreCard } from '../components/drop/StoreCard';
import { RepeatRow } from '../components/drop/RepeatRow';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import styles from './Inicio.module.css';

export default function Inicio() {
  const router = useRouter();
  const { user } = useAuth() || ({} as any);
  const addToCart = useAddToCart();
  const address = useDeliveryAddress();
  const picker = useAddressPicker();
  const { orders, activeOrders } = useActiveOrders();
  const { unreadCount } = useNotifications();
  const { banners } = usePromoBanners();
  const { stores: featured } = useFeaturedStores();
  const { stores: allStores, loading: storesLoading } = useStores();
  const nearby = useNearbyStores(address.point);
  const offers = useOffers(address.point);
  const offerStoreIds = useMemo(() => offers.products.map((p: any) => p.storeId).filter(Boolean), [offers.products]);
  const { quotes } = useStoreQuotes(offerStoreIds, address.point);

  // Um Banner por tela (spec §4 regra 12): avisos da DROP primeiro, depois lojas em destaque.
  const bannerItems = useMemo(() => [
    ...banners.map((b: any) => ({ id: b._id, title: b.title || '', imageUrl: imageUrl(b.imageUrl, { w: 1600 }) || undefined, href: b.linkUrl || undefined, hideCaption: true })),
    ...featured.map((s: any) => ({ id: s._id, title: s.name, subtitle: s.neighborhood, imageUrl: imageUrl(s.featuredBannerUrl, { w: 1600 }) || undefined, href: lojaHref(s._id) })),
  ], [banners, featured]);

  const repeat = useMemo(() => (user ? repeatItems(orders) : []), [orders, user]);

  const storeList = address.point ? nearby.stores : allStores.slice(0, 8);
  const noAddress = deliveryStates({ hasPoint: !!address.point, address: address.label, onSetAddress: picker.request, onChangeAddress: picker.request });

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div className={styles.topRow}>
          <div className={styles.address}><DeliveryAddressControl address={address} picker={picker} /></div>
          {user && (
            <button type="button" className={styles.bell} aria-label={unreadCount ? `Notificações, ${unreadCount} não lidas` : 'Notificações'} onClick={() => router.push(ROUTES.notificacoes)}>
              <Bell size={22} aria-hidden="true" />
              {unreadCount > 0 && <i className={styles.bellCount} aria-hidden="true">{unreadCount}</i>}
            </button>
          )}
        </div>
        <button type="button" className={styles.searchButton} onClick={() => router.push(buscarHref({ focus: true }))}>
          <Search size={20} strokeWidth={1.75} aria-hidden="true" />
          <span>Buscar produtos e lojas</span>
        </button>
      </header>

      {user && activeOrders.length > 0 && (
        <section className={styles.section} aria-label="Pedido em andamento">
          <ActiveOrdersSection orders={activeOrders} onOpen={(id) => router.push(pedidoHref(id))} />
        </section>
      )}

      {bannerItems.length > 0 && <div className={styles.section}><Banner items={bannerItems} /></div>}

      {repeat.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Pra você repetir</h2>
            <button type="button" className={styles.sectionLink} onClick={() => router.push(ROUTES.pedidos)}>Ver pedidos</button>
          </div>
          <div className={styles.card}>
            {repeat.map((r) => (
              <RepeatRow key={r.productId} meta={r.meta} product={{ name: r.name, store: r.storeName, imageUrl: imageUrl(r.image) || undefined, price: r.price }}
                onAdd={() => addToCart({ productId: r.productId, quantity: 1, name: r.name, price: r.price, storeId: r.storeId, storeName: r.storeName, image: r.image })} />
            ))}
          </div>
        </section>
      )}

      {(offers.loading || offers.failed || offers.products.length > 0) && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Ofertas que chegam rápido</h2>
            <button type="button" className={styles.sectionLink} onClick={() => router.push(buscarHref({ tab: 'produtos' }))}>Ver todas</button>
          </div>
          {offers.failed ? (
            <EmptyState variant="error" icon={<StoreIcon />} title="Não carregamos as ofertas" description="Confira sua conexão." onRetry={offers.retry} />
          ) : offers.loading ? (
            <div className={styles.grid}><Skeleton height={220} radius="var(--radius-lg)" /><Skeleton height={220} radius="var(--radius-lg)" /></div>
          ) : (
            <div className={styles.grid}>
              {offers.products.map((p: any) => (
                <div key={p._id} className={styles.tile} onClick={() => router.push(produtoHref(p._id))}>
                  <ProductCard variant="home" product={productCardData(p, quotes[p.storeId])}
                    onAdd={() => addToCart({ productId: p._id, quantity: 1, name: p.name, price: Number(p.price), storeId: p.storeId, storeName: p.storeName, image: p.image })} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Lojas perto de você</h2>
          <button type="button" className={styles.sectionLink} aria-label="Ver todas as lojas" onClick={() => router.push(buscarHref({ tab: 'lojas' }))}>Ver todas</button>
        </div>
        {!address.point && noAddress.map((s, i) => <DeliveryBadge key={i} state={s} />)}
        {(address.point ? nearby.loading : storesLoading) ? (
          <div className={styles.list}><Skeleton height={64} /><Skeleton height={64} /><Skeleton height={64} /></div>
        ) : address.point && nearby.failed ? (
          <EmptyState variant="error" icon={<StoreIcon />} title="Não carregamos as lojas" description="Confira sua conexão." onRetry={nearby.retry} />
        ) : storeList.length === 0 && !address.point ? (
          <EmptyState icon={<StoreIcon />} title="Escolha onde entregar para ver as lojas perto de você"
            action={<Button variant="secondary" onClick={picker.request}>Escolher endereço</Button>} />
        ) : storeList.length === 0 ? (
          <EmptyState icon={<StoreIcon />} title="Nenhuma loja entrega aqui ainda" description="Tente outro endereço." />
        ) : (
          <div className={styles.list}>
            {storeList.map((s: any) => (
              <StoreCard key={s._id} variant="resultado" store={mapStore(s, s.quote)} onClick={() => router.push(lojaHref(s._id))} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
