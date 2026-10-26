import { useRef, useState } from 'react';
import { CheckCircle2, Home, Store } from 'lucide-react';
import api from '../../../lib/api';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { RouteThumbnail } from '../../map/RouteThumbnail';
import { splitAddressLines } from '../../../lib/address';
import { formatMoney } from '../../../lib/money';
import type { RoutePoint } from '../../../lib/staticMap';
import blocks from '../../panel/PanelBlocks.module.css';
import { RideActions } from './RideActions';
import { customerPoint, mapsUrl, storePoint, telHref } from './rideView';
import styles from './Corrida.module.css';

/**
 * Corrida de devolução (caso B, DS v2 "Corrida de devolução"). Na corrida, store* é a casa do
 * cliente (retirada) e customer* é a loja (destino); storeObj/customerObj seguem sendo a loja e o
 * cliente de verdade, para nomes e telefones.
 */

const placeLine = (address?: string | null) => {
  const a = splitAddressLines(address || '');
  return [a.line1, a.line2].filter(Boolean).join(' · ');
};

/** 1 · Buscar com o cliente: o motoboy digita o código de retirada que o cliente mostra. */
export function DevolucaoBuscarView({ ride, self, onPicked, onProblem }: { ride: any; self: RoutePoint | null; onPicked: () => void; onProblem: () => void }) {
  const customer = ride?.customerObj || {};
  const store = ride?.storeObj || {};
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);

  const confirm = async () => {
    if (pin.length !== 5 || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/deliveries/${ride._id}/retirar-devolucao`, { pin });
      onPicked();
    } catch (e: any) {
      const status = e?.response?.status;
      setError(status === 400 ? 'Código não confere. Peça de novo ao cliente.' : e?.response?.data?.error || 'Não deu para confirmar agora. Tente de novo.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.map}>
        <RouteThumbnail store={storePoint(ride)} customer={customerPoint(ride)} motoboy={self} polyline={ride?.routePolyline} height={180} />
      </div>
      <section className={blocks.blk}>
        <div className={styles.place}>
          <span className={`${blocks.ico} ${blocks.icoBrand}`} aria-hidden="true"><Home size={18} /></span>
          <span className={blocks.tx}><b>{customer.name || 'Cliente'}</b><span>{placeLine(ride?.storeAddress)}</span></span>
        </div>
        <RideActions maps={mapsUrl(storePoint(ride))} tel={telHref(customer.telefone)} chatLabel="Mensagem para o cliente" callLabel="Ligar para o cliente" />
        <span className={blocks.meta}>{`Depois, leve à ${store.name || 'loja'}.`}</span>
      </section>
      <section className={blocks.blk}>
        <Input
          label="Código de retirada (peça ao cliente)"
          value={pin}
          onChange={(v: string) => setPin(String(v).replace(/\D/g, '').slice(0, 5))}
          inputMode="numeric"
          maxLength={5}
          autoComplete="one-time-code"
        />
        {error && <p role="alert" className={blocks.meta}>{error}</p>}
        <Button onClick={confirm} disabled={pin.length !== 5} loading={busy}>Confirmar retirada</Button>
      </section>
      <Button variant="tertiary" onClick={onProblem}>Não consigo buscar</Button>
    </div>
  );
}

/** 2 · Levar à loja: o motoboy mostra o código de devolução, que a loja digita ao receber. */
export function DevolucaoLevarView({ ride, self }: { ride: any; self: RoutePoint | null }) {
  const store = ride?.storeObj || {};
  return (
    <div className={styles.screen}>
      <div className={styles.map}>
        <RouteThumbnail store={customerPoint(ride)} motoboy={self} height={180} />
      </div>
      <section className={blocks.blk}>
        <div className={styles.place}>
          <span className={`${blocks.ico} ${blocks.icoBrand}`} aria-hidden="true"><Store size={18} /></span>
          <span className={blocks.tx}><b>{store.name || 'Loja'}</b><span>{placeLine(ride?.customerAddress || store.address)}</span></span>
        </div>
        <RideActions maps={mapsUrl(customerPoint(ride))} tel={telHref(store.telefone)} chatLabel="Mensagem para a loja" callLabel="Ligar para a loja" />
      </section>
      <section className={`${blocks.blk} ${blocks.blkBrand} ${styles.center}`}>
        <span className={blocks.cap}>Código de devolução</span>
        <div className={styles.pin} data-testid="pin-devolucao-loja">{ride?.returnPin || '—'}</div>
        <span className={blocks.meta}>A loja digita este código ao receber o produto.</span>
      </section>
      <Alert tone="success" title={`${formatMoney(Number(ride?.fee) || 0)} por esta corrida`}>
        A loja paga por Pix quando confirmar o produto.
      </Alert>
    </div>
  );
}

/** A loja recebeu o produto. */
export function DevolucaoConcluida({ onNext }: { onNext: () => void }) {
  return (
    <div className={styles.screen}>
      <div className={styles.done}>
        <span className={`${styles.doneIcon} ${styles.doneOk}`} aria-hidden="true"><CheckCircle2 size={28} /></span>
        <h1 className={styles.doneTitle}>Devolução concluída</h1>
        <p className={styles.doneText}>A loja recebeu o produto. O valor da corrida chega por Pix, pago pela loja.</p>
      </div>
      <div className={styles.bar}>
        <Button onClick={onNext}>Procurar próxima corrida</Button>
      </div>
    </div>
  );
}
