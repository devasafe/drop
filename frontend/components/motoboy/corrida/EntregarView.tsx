import { useId, useState } from 'react';
import { Alert } from '../../ui/Alert';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { RouteThumbnail } from '../../map/RouteThumbnail';
import { splitAddressLines } from '../../../lib/address';
import type { RoutePoint } from '../../../lib/staticMap';
import blocks from '../../panel/PanelBlocks.module.css';
import { PinBoxes } from './PinBoxes';
import { RideActions } from './RideActions';
import { PIN_LENGTH, useFinalizeRide, type FinalizeRide } from './useFinalizeRide';
import { customerPoint, mapsUrl, storePoint, telHref } from './rideView';
import styles from './Corrida.module.css';

export interface EntregarViewProps {
  ride: any;
  self: RoutePoint | null;
  onChat: () => void;
  onProblem: () => void;
  onAbsent: () => void;
  /** Só depois que o servidor confirmou a entrega. */
  onFinished: () => void;
  /** 409: a página relê a corrida. */
  onReload: () => void;
  /** Tocar no mapa de 180 px: a página abre o MotoboyNavMap em tela cheia (C1/K1). */
  onOpenNav?: () => void;
  /**
   * O `useFinalizeRide` da página, quando ela também o liga ao `onFinalize` do MotoboyNavMap (K2):
   * os dois caminhos dividem a mesma guarda de envio. Sem ele, a view usa o próprio.
   */
  finalizer?: FinalizeRide;
}

/** Etapa 2 de 2: digitar o PIN do cliente e finalizar. Um envio por PIN completo; nunca loga o PIN. */
export function EntregarView({ ride, self, onChat, onProblem, onAbsent, onFinished, onReload, onOpenNav, finalizer }: EntregarViewProps) {
  const msgId = useId();
  const own = useFinalizeRide(ride?._id, { onConflict: onReload });
  const f = finalizer ?? own;
  const [pin, setPin] = useState('');

  const customer = ride?.customerObj || {};
  const addr = splitAddressLines(ride?.customerAddress || ride?.deliveryAddress);
  const waitMin = Number(ride?.customerAbsentWaitMin);
  const refused = f.isRefused(pin);
  const wrongNow = f.status === 'wrong' && refused;
  const message = wrongNow || f.status === 'locked' || f.status === 'error' ? f.message : '';
  const canSend = pin.length === PIN_LENGTH && f.online && f.status !== 'sending' && f.status !== 'done' && !refused;

  const finalize = async () => {
    if (!canSend) return;
    const r = await f.finalize(pin);
    if (r.ok) onFinished();
  };

  return (
    <div className={styles.screen}>
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

      <section className={blocks.blk}>
        <div className={styles.place}>
          <Avatar name={customer.name || 'Cliente'} size="sm" />
          <span className={blocks.tx}>
            <b>{customer.name || 'Cliente'}</b>
            <span>{[addr.line1, addr.line2].filter(Boolean).join(' · ')}</span>
          </span>
        </div>
        <RideActions
          maps={mapsUrl(customerPoint(ride))}
          tel={telHref(customer.telefone)}
          onChat={onChat}
          chatLabel="Mensagem para o cliente"
          callLabel="Ligar para o cliente"
        />
      </section>

      <section className={`${blocks.blk} ${styles.center}`}>
        <span className={blocks.cap}>Código que o cliente vai te dizer</span>
        <PinBoxes
          value={pin}
          onChange={setPin}
          error={wrongNow}
          disabled={f.status === 'sending'}
          describedBy={message ? msgId : undefined}
        />
        {message && <p id={msgId} role="alert" className={blocks.errText}>{message}</p>}
        {wrongNow && <p className={blocks.meta}>Peça o código de novo ao cliente.</p>}
        {!f.online && <p className={blocks.meta}>Sem conexão: o código fica guardado aqui e você finaliza quando a internet voltar.</p>}
        <Button onClick={finalize} disabled={!canSend} loading={f.status === 'sending'}>Finalizar entrega</Button>
      </section>

      <Alert tone="info" title="Cliente não atende?" action={{ label: 'Ver a espera', onClick: onAbsent }}>
        {Number.isFinite(waitMin) && waitMin > 0
          ? `Aguarde ${waitMin} min no local. Depois disso você pode encerrar como cliente ausente.`
          : 'Aguarde a espera mínima no local. Depois disso você pode encerrar como cliente ausente.'}
      </Alert>

      <div className={styles.bar}>
        <Button variant="tertiary" onClick={onProblem}>Tive um problema na entrega</Button>
      </div>
    </div>
  );
}

export default EntregarView;
