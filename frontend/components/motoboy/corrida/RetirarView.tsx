import Link from 'next/link';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';
import { Store } from 'lucide-react';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { RouteThumbnail } from '../../map/RouteThumbnail';
import { splitAddressLines } from '../../../lib/address';
import { formatClock } from '../../../lib/sellerApi';
import type { RoutePoint } from '../../../lib/staticMap';
import blocks from '../../panel/PanelBlocks.module.css';
import { RideActions } from './RideActions';
import {
  PICKUP_LATE_MIN, customerPoint, itemsLine, mapsUrl, minutesSince, msSince, rideCode, storePoint, telHref,
} from './rideView';
import styles from './Corrida.module.css';

export interface RetirarViewProps {
  ride: any;
  now: number;
  self: RoutePoint | null;
  onChat: () => void;
  onProblem: () => void;
  onReturn: () => void;
  /** Tocar no mapa de 180 px: a página abre o MotoboyNavMap em tela cheia (C1/K1). */
  onOpenNav?: () => void;
}

/** Etapa 1 de 2: mostrar o PIN de retirada. A loja valida; a tela muda sozinha (useRide). */
export function RetirarView({ ride, now, self, onChat, onProblem, onReturn, onOpenNav }: RetirarViewProps) {
  const store = ride?.storeObj || {};
  const addr = splitAddressLines(ride?.storeAddress || store.address);
  const mins = minutesSince(ride?.assignedAt, now);
  const late = mins !== null && mins >= PICKUP_LATE_MIN;
  const items = itemsLine(ride?.order);

  return (
    <div className={styles.screen}>
      {late && (
        <Alert tone="warning" title={`A retirada já leva ${mins} min`}>
          A loja ainda não validou seu código. Fale com ela ou avise o suporte.
        </Alert>
      )}
      {!late && (
        <div className={styles.map}>
          <RouteThumbnail
            store={storePoint(ride)}
            customer={customerPoint(ride)}
            motoboy={self}
            polyline={ride?.routePolyline}
            height={180}
            onExpand={onOpenNav}
          />
        </div>
      )}

      <section className={blocks.blk}>
        <div className={styles.place}>
          <span className={`${blocks.ico} ${blocks.icoBrand}`} aria-hidden="true"><Store size={18} /></span>
          <span className={blocks.tx}>
            <b>{store.name || 'Loja'}</b>
            <span>{[addr.line1, addr.line2].filter(Boolean).join(' · ')}</span>
          </span>
        </div>
        <RideActions
          maps={late ? null : mapsUrl(storePoint(ride))}
          tel={telHref(store.telefone)}
          onChat={onChat}
          chatLabel="Mensagem para a loja"
          callLabel="Ligar para a loja"
          withText={late}
        />
      </section>

      <section className={`${blocks.blk} ${blocks.blkBrand} ${styles.center}`} aria-live="polite">
        <span className={blocks.cap}>Mostre este código na loja</span>
        <div className={styles.pin} data-testid="pin-retirada">{ride?.pinRetirada || '—'}</div>
        <span className={`${blocks.tag} ${blocks.tagWarn}`}>
          {late ? `Aguardando a loja · ${formatClock(msSince(ride?.assignedAt, now) ?? 0)}` : 'Aguardando a loja validar'}
        </span>
        {!late && <span className={blocks.meta}>Quando a loja digitar o código, esta tela muda sozinha para a entrega.</span>}
      </section>

      {late ? (
        <section className={blocks.blk}>
          <div className={blocks.head}><b className={blocks.headTitle}>Se não der para esperar</b></div>
          <p className={blocks.sub}>Você pode devolver a corrida antes de retirar, sem taxa. Ela volta para outros entregadores.</p>
          <div className={styles.actions}>
            <Link href={MOTOBOY_ROUTES.perfilAjuda} className={styles.action}>Suporte</Link>
            <Button variant="danger" onClick={onReturn}>Devolver corrida</Button>
          </div>
        </section>
      ) : (
        <>
          <section className={blocks.blk}>
            <div className={blocks.head}>
              <b className={blocks.headTitle}>O que você vai levar</b>
              <span className={blocks.meta}>Pedido #{rideCode(ride)}</span>
            </div>
            {items && <span className={blocks.sub}>{items}</span>}
            <span className={blocks.meta}>Confira se o pacote está lacrado antes de sair.</span>
          </section>
          <div className={styles.bar}>
            <Button variant="danger" onClick={onProblem}>Tive um problema na retirada</Button>
          </div>
        </>
      )}
    </div>
  );
}

export default RetirarView;
