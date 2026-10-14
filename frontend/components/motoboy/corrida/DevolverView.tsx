import { CheckCircle2, Store } from 'lucide-react';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { RouteThumbnail } from '../../map/RouteThumbnail';
import { splitAddressLines } from '../../../lib/address';
import { formatMoney } from '../../../lib/money';
import type { RoutePoint } from '../../../lib/staticMap';
import blocks from '../../panel/PanelBlocks.module.css';
import { RideActions } from './RideActions';
import { mapsUrl, storePoint, telHref } from './rideView';
import styles from './Corrida.module.css';

/** Levar o pacote de volta: a loja digita o código de devolução (pinDevolucao). */
export function DevolverView({ ride, self, compensation }: { ride: any; self: RoutePoint | null; compensation: number | null }) {
  const store = ride?.storeObj || {};
  const addr = splitAddressLines(ride?.storeAddress || store.address);
  return (
    <div className={styles.screen}>
      <div className={styles.map}>
        <RouteThumbnail store={storePoint(ride)} motoboy={self} height={180} />
      </div>
      <section className={blocks.blk}>
        <div className={styles.place}>
          <span className={`${blocks.ico} ${blocks.icoBrand}`} aria-hidden="true"><Store size={18} /></span>
          <span className={blocks.tx}><b>{store.name || 'Loja'}</b><span>{[addr.line1, addr.line2].filter(Boolean).join(' · ')}</span></span>
        </div>
        <RideActions maps={mapsUrl(storePoint(ride))} tel={telHref(store.telefone)} chatLabel="Mensagem para a loja" callLabel="Ligar para a loja" />
      </section>
      <section className={`${blocks.blk} ${blocks.blkBrand} ${styles.center}`}>
        <span className={blocks.cap}>Código de devolução</span>
        <div className={styles.pin} data-testid="pin-devolucao">{ride?.pinDevolucao || '—'}</div>
        <span className={blocks.meta}>A loja digita este código ao receber o pacote de volta.</span>
      </section>
      {compensation !== null && compensation > 0 && (
        <Alert tone="success" title="Sua corrida está garantida">
          Você recebe {formatMoney(compensation)} por esta corrida.
        </Alert>
      )}
    </div>
  );
}

export function DevolucaoConfirmada({ onNext }: { onNext: () => void }) {
  return (
    <div className={styles.screen}>
      <div className={styles.done}>
        <span className={`${styles.doneIcon} ${styles.doneOk}`} aria-hidden="true"><CheckCircle2 size={28} /></span>
        <h1 className={styles.doneTitle}>Devolução confirmada</h1>
        <p className={styles.doneText}>A loja recebeu o pacote de volta.</p>
      </div>
      <div className={styles.bar}>
        <Button onClick={onNext}>Procurar próxima corrida</Button>
      </div>
    </div>
  );
}

export default DevolverView;
