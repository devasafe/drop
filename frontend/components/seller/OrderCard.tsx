import { useState } from 'react';
import { User, Bike, Package, ChevronRight, Check, X, MapPin } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import Icon from '../Icon';
import { RouteThumbnail } from '../map/RouteThumbnail';
import { parseCoords } from '../../lib/geo';
import styles from './OrderCard.module.css';

type Tone = 'new' | 'waiting' | 'enroute' | 'delivering' | 'danger' | 'done';

interface Props {
  order: any;
  isNew: boolean;
  pinInput: string;
  pinStatus?: string;
  onPinInput: (v: string) => void;
  onPinValidate: () => void;
  onAccept: () => void;
  onReject: () => void;
  onDetails: () => void;
}

const fmtBRL = (v: any) => {
  const n = typeof v === 'number' ? v : Number(v);
  return `R$ ${(Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')}`;
};
const fmtDate = (v: any) =>
  v ? new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/** Deriva rótulo + tom do status a partir do pedido/entrega. */
function statusView(order: any): { label: string; tone: Tone } {
  const d = order.delivery;
  if (order.status === 'cancelado' || order.status === 'rejeitado' || order.status === 'cancelled') return { label: 'Cancelado', tone: 'danger' };
  if (order.status === 'entregue' || order.status === 'delivered') return { label: 'Finalizado', tone: 'done' };
  if (order.status === 'criado' || order.status === 'created') return { label: 'Novo', tone: 'new' };
  if (d?.motoboyId) {
    if (d.status === 'picked' || order.status === 'enviado') return { label: 'Entregando', tone: 'delivering' };
    return { label: 'Motoboy a caminho', tone: 'enroute' };
  }
  return { label: 'Aguardando motoboy', tone: 'waiting' };
}

const TONE_CLASS: Record<Tone, string> = {
  new: styles.toneNew,
  waiting: styles.toneWaiting,
  enroute: styles.toneEnroute,
  delivering: styles.toneEnroute,
  danger: styles.toneDanger,
  done: styles.toneDone,
};

export default function OrderCard({ order, isNew, pinInput, pinStatus, onPinInput, onPinValidate, onAccept, onReject, onDetails }: Props) {
  const [showAllItems, setShowAllItems] = useState(false);
  const sv = statusView(order);
  const products: any[] = Array.isArray(order.products) ? order.products : [];
  const isCriado = order.status === 'criado' || order.status === 'created';
  const isPlan1 = !order.delivery && (order.status === 'pago' || order.status === 'paid') && (!order.deliveryFee || order.deliveryFee === 0);
  const hasMotoboy = !!order.delivery?.motoboyId;
  const canCancel = !hasMotoboy;
  const store = parseCoords(order.storeLatitude, order.storeLongitude);
  const customer = parseCoords(order.customerLatitude, order.customerLongitude);
  const showMap = !!(store || customer);
  const motoboyName = order.delivery?.motoboyName
    || (order.delivery?.motoboyId && typeof order.delivery.motoboyId === 'object' ? order.delivery.motoboyId.name : null);

  return (
    <article className={`${styles.card} ${TONE_CLASS[sv.tone]}`}>
      {/* Header */}
      <header className={styles.head}>
        <div className={styles.headLeft}>
          <div className={styles.id}>ID: {String(order._id || '').toUpperCase()}</div>
          <div className={styles.customer}><User size={15} aria-hidden="true" /> {order.customerName || 'Cliente'}</div>
        </div>
        <div className={styles.badges}>
          {isNew && <span className={`${styles.badge} ${styles.badgeNew}`}>NOVO</span>}
          <span className={`${styles.badge} ${styles.badgeStatus}`}>{sv.label.toUpperCase()}</span>
        </div>
      </header>

      {/* Corpo: conteúdo à esquerda + mapa à direita (desktop); empilha no mobile */}
      <div className={styles.body}>
        <div className={styles.info}>
          <div className={styles.metaGrid}>
            <div className={styles.metaCell}>
              <span className={styles.metaKey}>Motoboy</span>
              <span className={`${styles.metaVal} ${hasMotoboy ? styles.metaValOk : styles.metaValWait}`}>
                {motoboyName || 'Aguardando'}
              </span>
            </div>
            <div className={styles.metaCell}>
              <span className={styles.metaKey}>Itens do pedido</span>
              <span className={styles.metaVal}>
                <Package size={13} aria-hidden="true" />{' '}
                {products.length === 0 ? '—' : (
                  showAllItems || products.length === 1
                    ? `${products[0].quantity}x ${products[0].productName || 'Produto'}`
                    : `${products.length} itens`
                )}
              </span>
              {products.length > 1 && (
                <button className={styles.itemsToggle} onClick={() => setShowAllItems((s) => !s)}>
                  {showAllItems ? 'ocultar' : 'ver itens'}
                </button>
              )}
            </div>
            <div className={styles.metaCell}>
              <span className={styles.metaKey}>Total do pedido</span>
              <span className={styles.total}>{fmtBRL(order.totalValue)}</span>
            </div>
            <div className={styles.metaCell}>
              <span className={styles.metaKey}>Criado</span>
              <span className={styles.metaValMuted}>{fmtDate(order.createdAt)}</span>
            </div>
          </div>

          {/* Lista expandida de itens */}
          {showAllItems && products.length > 1 && (
            <ul className={styles.itemsList}>
              {products.map((p, i) => (
                <li key={i} className={styles.itemRow}>
                  <span><span className={styles.itemQty}>{p.quantity}x</span> {p.productName || 'Produto'}</span>
                  <span className={styles.itemPrice}>{fmtBRL((p.price || 0) * (p.quantity || 0))}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Endereço (Plano 1 sem entrega) */}
          {isPlan1 && order.customerAddress && (
            <div className={styles.addrBox}>
              <span className={styles.metaKey}><MapPin size={12} aria-hidden="true" /> Endereço de entrega</span>
              <span className={styles.addrText}>{order.customerAddress}</span>
            </div>
          )}

          {/* Validação de PIN de retirada (motoboy assigned) */}
          {order.delivery?.status === 'assigned' && (
            <div className={styles.pinRow}>
              <Input value={pinInput} onChange={onPinInput} placeholder="PIN de retirada" className={styles.pinInput} />
              <Button variant="ghost" size="sm" onClick={onPinValidate} disabled={!pinInput}>Validar PIN</Button>
            </div>
          )}
          {pinStatus && (
            <div className={`${styles.pinStatus} ${pinStatus.includes('sucesso') ? styles.pinOk : styles.pinErr}`}>{pinStatus}</div>
          )}
        </div>

        {showMap && (
          <div className={styles.mapWrap}>
            <RouteThumbnail store={store} customer={customer} polyline={order.routePolyline} height={150} />
          </div>
        )}
      </div>

      {/* Rodapé: Ver detalhes (esquerda) + ações (direita) */}
      <footer className={styles.foot}>
        <button className={styles.detailsLink} onClick={onDetails}>
          Ver detalhes <ChevronRight size={15} aria-hidden="true" />
        </button>

        <div className={styles.actions}>
          {isCriado ? (
            <>
              <Button variant="primary" size="sm" className={styles.accept} leftIcon={<Check size={15} />} onClick={onAccept}>Aceitar pedido</Button>
              <Button variant="danger" size="sm" leftIcon={<X size={15} />} onClick={onReject}>Rejeitar</Button>
            </>
          ) : isPlan1 ? (
            <span className={`${styles.statusPill} ${styles.pillWaiting}`}>
              <Icon name="clock" size={13} /> Aguardando cliente confirmar
            </span>
          ) : hasMotoboy ? (
            <span className={`${styles.statusPill} ${styles.pillEnroute}`}>
              <Bike size={14} aria-hidden="true" /> Motoboy a caminho
            </span>
          ) : (
            <>
              <span className={`${styles.statusPill} ${styles.pillWaiting}`}>
                <Bike size={14} aria-hidden="true" /> Aguardando motoboy
              </span>
              {canCancel && (
                <Button variant="ghost" size="sm" onClick={onReject}>Cancelar pedido</Button>
              )}
            </>
          )}
        </div>
      </footer>
    </article>
  );
}
