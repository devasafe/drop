import { useRouter } from 'next/router';
import { ArrowLeft, PauseCircle } from 'lucide-react';
import { useDeliveryAddress } from '../../hooks/useDeliveryAddress';
import { useNearbyStores } from '../../hooks/useCatalogHome';
import { mapStore } from '../../lib/mapStore';
import { buscarHref, lojaHref } from '../../lib/routes';
import { initials } from '../ui/Avatar';
import { IconButton } from '../ui/IconButton';
import { ICON_BUTTON_STROKE_WIDTH } from '../ui/Icon';
import { Button } from '../ui/Button';
import { StoreCard } from './StoreCard';
import styles from './StoreUnavailable.module.css';

export interface StoreUnavailableProps {
  store: { _id: string; name: string; neighborhood?: string | null; city?: string | null };
}

/** Loja pausada (link ou QR): a cara continua reconhecível e há sempre uma saída. Nunca diz o motivo. */
export function StoreUnavailable({ store }: StoreUnavailableProps) {
  const router = useRouter();
  const address = useDeliveryAddress();
  const nearby = useNearbyStores(address.point, 4);
  const others = (nearby.stores || []).filter((s: any) => s._id !== store._id).slice(0, 3);
  return (
    <main className={styles.page}>
      <div className={styles.cover} aria-hidden="true" />
      <span className={styles.back}>
        <IconButton variant="onImage" aria-label="Voltar" icon={<ArrowLeft size={20} strokeWidth={ICON_BUTTON_STROKE_WIDTH} aria-hidden="true" />} onClick={() => router.back()} />
      </span>
      <header className={styles.head}>
        <span className={styles.logo} aria-hidden="true">{initials(store.name)}</span>
        <h1 className={styles.title}>{store.name}</h1>
        {(store.neighborhood || store.city) && <p className={styles.meta}>{[store.neighborhood, store.city].filter(Boolean).join(' · ')}</p>}
        <span className={styles.pill}>Fora do ar por enquanto</span>
      </header>
      <section className={styles.body}>
        <div className={styles.notice}>
          <span className={styles.ico} aria-hidden="true"><PauseCircle size={24} /></span>
          <p className={styles.noticeTitle}>Esta loja não está recebendo pedidos agora</p>
          <p className={styles.noticeText}>Tente de novo mais tarde. Enquanto isso, veja lojas perto de você.</p>
        </div>
        {others.length > 0 && (
          <div className={styles.list}>
            {others.map((s: any) => <StoreCard key={s._id} variant="resultado" store={mapStore(s, s.quote)} onClick={() => router.push(lojaHref(s._id))} />)}
          </div>
        )}
        <Button variant="secondary" onClick={() => router.push(buscarHref({ tab: 'lojas' }))}>Ver lojas</Button>
      </section>
    </main>
  );
}
