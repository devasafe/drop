import { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Store as StoreIcon } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import {
  useAddresses,
  useNotifications,
  useOrders,
  useProducts,
  useStores,
} from '../hooks/useSync';
import { imageUrl } from '../lib/config';

import { AppHeader } from '../components/drop/AppHeader';
import { AddressBar } from '../components/drop/AddressBar';
import { SearchField } from '../components/ui/SearchField';
import { OrderTracker, OrderTrackerStep } from '../components/drop/OrderTracker';
import { StoreCard, StoreCardData } from '../components/drop/StoreCard';
import { FreteBanner } from '../components/drop/FreteBanner';
import { ProductCard } from '../components/drop/ProductCard';
import { RepeatRow } from '../components/drop/RepeatRow';
import { StickyCart } from '../components/drop/StickyCart';
import { TabBar, TabKey } from '../components/drop/TabBar';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';

import styles from './Inicio.module.css';

/**
 * Pedido "ativo" p/ o OrderTracker: pago (loja confirmou), aguardando
 * motoboy ou já enviado. `criado` (aguardando loja aceitar) e `entregue`
 * ficam de fora — não é "a caminho" ainda ou já terminou.
 */
const ACTIVE_ORDER_STATUSES = new Set(['pago', 'aguardando_motoboy', 'enviado']);

/** Progresso da barra do tracker por status — sem ETA real, é só a fração do fluxo. */
const PROGRESS_BY_STATUS: Record<string, number> = {
  criado: 0.15,
  pago: 0.35,
  aguardando_motoboy: 0.5,
  enviado: 0.75,
  entregue: 1,
};

/** Rótulo da fase atual mostrado no topo do tracker — nunca fixo "A caminho":
 * um pedido `pago` ainda está sendo preparado, dizer "a caminho" seria
 * status falso pro usuário. */
const STATUS_LABEL: Record<string, string> = {
  pago: 'Preparando',
  aguardando_motoboy: 'Buscando entregador',
  enviado: 'A caminho',
};

const TAB_ROUTES: Record<TabKey, string> = {
  inicio: '/inicio',
  buscar: '/',
  pedidos: '/user-dashboard',
  carteira: '/wallet',
  perfil: '/minha-conta',
};

function trackerSteps(status: string): OrderTrackerStep[] {
  return [
    { label: 'Confirmado', done: true },
    { label: 'Preparando', done: status !== 'pago' },
    { label: 'A caminho', done: status === 'enviado' },
  ];
}

/** Loja → StoreCardData. Sem rating/eta/frete reais no backend hoje (ver
 * StoreCard.tsx) — ficam de fora. `category` reaproveita bairro/cidade reais
 * da loja (não existe segmento/categoria por loja na API de listagem). */
function mapStore(store: any): StoreCardData {
  return {
    name: store.name,
    imageUrl: imageUrl(store.featuredBannerUrl || store.coverBannerUrl) || undefined,
    status: store.isOpen ? 'aberta' : 'fechada',
    category:
      [store.neighborhood, store.city].filter(Boolean).join(' • ') ||
      store.address ||
      'Endereço não informado',
  };
}

export default function Inicio() {
  const router = useRouter();
  const { user } = useAuth();
  const { cart, add } = useCart();

  const { addresses, loading: addressesLoading } = useAddresses();
  const { unreadCount } = useNotifications();
  const { orders } = useOrders();
  const { stores, loading: storesLoading } = useStores();
  const { products, loading: productsLoading } = useProducts();

  const [query, setQuery] = useState('');

  const storeById = useMemo(() => {
    const map = new Map<string, any>();
    stores.forEach((s: any) => map.set(s._id, s));
    return map;
  }, [stores]);

  const defaultAddress = useMemo(
    () => addresses.find((a: any) => a.isDefault) || addresses[0],
    [addresses]
  );

  const activeOrder = useMemo(
    () => (user ? orders.find((o: any) => ACTIVE_ORDER_STATUSES.has(o.status)) : undefined),
    [orders, user]
  );

  const storeCards = useMemo(() => stores.map(mapStore), [stores]);

  const offerProducts = useMemo(() => products.slice(0, 8), [products]);

  const repeatItems = useMemo(() => {
    if (!user) return [];
    const seen = new Set<string>();
    const items: Array<{ key: string; productId: string; storeId?: string; name: string; store?: string; imageUrl?: string; price: number }> = [];
    for (const order of orders) {
      for (const item of order.products || []) {
        if (!item.productId || seen.has(item.productId)) continue;
        seen.add(item.productId);
        items.push({
          key: item.productId,
          productId: item.productId,
          storeId: order.storeId,
          name: item.productName || 'Produto',
          store: order.storeName,
          imageUrl: imageUrl(item.image) || undefined,
          price: item.price,
        });
        if (items.length >= 6) break;
      }
      if (items.length >= 6) break;
    }
    return items;
  }, [orders, user]);

  const cartCount = cart.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);
  const cartTotal = cart.reduce((sum: number, c: any) => sum + (c.price || 0) * (c.quantity || 0), 0);

  const addToCart = (p: { productId: string; name: string; price: number; storeId?: string }) => {
    add({ productId: p.productId, quantity: 1, name: p.name, price: p.price, storeId: p.storeId });
  };

  const handleTabNavigate = (key: TabKey) => router.push(TAB_ROUTES[key]);

  const handleSearch = () => {
    const q = query.trim();
    router.push(q ? `/?q=${encodeURIComponent(q)}` : '/');
  };

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <AppHeader
          notifications={unreadCount}
          onBell={() => router.push('/notifications')}
          onAvatar={() => router.push(user ? '/minha-conta' : '/login')}
        />

        {!user ? (
          <AddressBar
            label="Entrar para"
            address="escolher endereço"
            onClick={() => router.push('/login')}
          />
        ) : addressesLoading ? (
          <div className={styles.addressSkeleton}>
            <Skeleton width={200} height={15} />
          </div>
        ) : defaultAddress ? (
          <AddressBar
            label={defaultAddress.label || 'Entregar em'}
            address={`${defaultAddress.street}, ${defaultAddress.number}`}
            onClick={() => router.push('/minha-conta')}
          />
        ) : (
          <AddressBar
            label="Adicionar"
            address="endereço de entrega"
            onClick={() => router.push('/minha-conta')}
          />
        )}

        <div className={styles.searchRow}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Buscar produtos ou lojas…"
            onFilter={handleSearch}
          />
        </div>
      </div>

      {user && activeOrder && (
        <div className={styles.section}>
          <OrderTracker
            orderId={activeOrder._id.slice(-6).toUpperCase()}
            storeName={activeOrder.storeName || 'Loja'}
            imageUrl={imageUrl(activeOrder.products?.[0]?.image) || undefined}
            statusLabel={STATUS_LABEL[activeOrder.status] ?? 'Em andamento'}
            progress={PROGRESS_BY_STATUS[activeOrder.status] ?? 0.35}
            steps={trackerSteps(activeOrder.status)}
          />
        </div>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Lojas perto de você</h2>
          <button type="button" className={styles.sectionLink} onClick={() => router.push('/stores')}>
            Ver todas
          </button>
        </div>

        {storesLoading ? (
          <div className={styles.storesSkeleton}>
            <Skeleton height={130} radius={20} />
            <Skeleton height={58} radius={14} />
            <Skeleton height={58} radius={14} />
          </div>
        ) : storeCards.length === 0 ? (
          <EmptyState
            icon={<StoreIcon />}
            title="Nenhuma loja por perto"
            description="Ainda não há lojas cadastradas na plataforma."
          />
        ) : (
          <>
            <StoreCard
              variant="destaque"
              store={storeCards[0]}
              onClick={() => router.push(`/stores/${stores[0]._id}`)}
            />
            <div className={styles.storeRows}>
              {storeCards.slice(1).map((s, i) => {
                const raw = stores[i + 1];
                return (
                  <StoreCard
                    key={raw._id}
                    variant="resultado"
                    store={s}
                    onClick={() => router.push(`/stores/${raw._id}`)}
                  />
                );
              })}
            </div>
          </>
        )}
      </section>

      <div className={styles.section}>
        <FreteBanner
          title="Frete grátis acima de R$ 40"
          ctaLabel="Aproveitar"
          onCta={() => router.push('/stores')}
        />
      </div>

      {(productsLoading || offerProducts.length > 0) && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Ofertas</h2>
            <button type="button" className={styles.sectionLink} onClick={() => router.push('/')}>
              Ver todas
            </button>
          </div>

          {productsLoading ? (
            <div className={styles.offersRow}>
              <Skeleton width={150} height={130} radius={14} />
              <Skeleton width={150} height={130} radius={14} />
            </div>
          ) : (
            <div className={styles.offersRow}>
              {offerProducts.map((p: any) => (
                <div
                  key={p._id}
                  className={styles.offerItem}
                  onClick={() => router.push(`/product/${p._id}`)}
                >
                  <ProductCard
                    variant="home"
                    product={{
                      name: p.name,
                      store: storeById.get(p.storeId)?.name,
                      imageUrl: imageUrl(p.image) || undefined,
                      price: Number(p.price),
                    }}
                    onAdd={(e?: any) => {
                      e?.stopPropagation?.();
                      addToCart({ productId: p._id, name: p.name, price: Number(p.price), storeId: p.storeId });
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {user && repeatItems.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Pra você repetir</h2>
          </div>
          <div className={styles.repeatList}>
            {repeatItems.map((r) => (
              <RepeatRow
                key={r.key}
                product={{ name: r.name, store: r.store, imageUrl: r.imageUrl, price: r.price }}
                onAdd={() => addToCart({ productId: r.productId, name: r.name, price: r.price, storeId: r.storeId })}
              />
            ))}
          </div>
        </section>
      )}

      {cartCount > 0 && (
        <StickyCart count={cartCount} total={cartTotal} onOpen={() => router.push('/checkout')} />
      )}

      <div className={styles.tabBarWrap}>
        <TabBar active="inicio" onNavigate={handleTabNavigate} />
      </div>
    </div>
  );
}
