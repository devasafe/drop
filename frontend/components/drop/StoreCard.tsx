import { KeyboardEvent } from 'react';
import { Store as StoreIcon, Truck, Zap } from 'lucide-react';
import { StatusPill, StoreStatus } from '../ui/StatusPill';
import { ICON_STROKE_WIDTH } from '../ui/Icon';
import { Badge } from '../ui/Badge';
import { formatRating } from '../ui/Rating';
import { StoreLogo } from './StoreLogo';
import { formatMoney } from '../../lib/money';
import { formatEtaRange } from '../../lib/deliveryView';
import styles from './StoreCard.module.css';

export interface StoreCardData {
  name: string;
  imageUrl?: string;
  /** Logo do lojista (`Store.logoUrl`); sem ele, a linha mostra as iniciais. */
  logoUrl?: string;
  status: StoreStatus;
  category: string;
  /** Prazo, frete e área são opcionais: sem dado, o pedaço não é renderizado
   * (nunca um valor inventado). Vêm da cotação de entrega. */
  etaMin?: [number, number];
  fee?: number;
  freeDelivery?: boolean;
  outOfArea?: boolean;
  opensAt?: string;
  /** Loja pausada pelo lojista: "HH:MM" em que volta. */
  pausedBackAt?: string;
  distanceKm?: number;
  /** Média (≥ 3 avaliações) e contagem — vem do backend. */
  rating?: { average: number; count: number };
  /** "fecha às HH:MM" quando aberta pelo horário cadastrado. */
  closesAt?: string;
  /** Plano 1: a loja combina a entrega com o cliente. */
  vitrine?: boolean;
}

const km = (n?: number) => (typeof n === 'number' ? `${n.toFixed(1).replace('.', ',')} km` : null);

/** Linha embaixo do nome (variante resultado): nota + horário, ou o aviso que manda. */
function subLine(s: StoreCardData): string {
  if (s.outOfArea) return 'Não entrega aqui';
  if (s.status === 'fechada' && s.pausedBackAt) return `Pausada · volta às ${s.pausedBackAt}`;
  if (s.status === 'fechada') return s.opensAt ? `Loja fechada · abre às ${s.opensAt}` : 'Loja fechada';
  const parts: string[] = [];
  if (s.rating) parts.push(`★ ${formatRating(s.rating.average)} (${s.rating.count})`);
  if (s.vitrine) parts.push('Vitrine · você combina a entrega');
  else if (s.closesAt) parts.push(`fecha às ${s.closesAt}`);
  return parts.length ? parts.join(' · ') : s.category;
}

export interface StoreCardProps {
  variant: 'destaque' | 'resultado';
  store: StoreCardData;
  onClick: () => void;
}

type LineTone = 'fast' | 'off' | 'muted' | 'normal';

function deliveryLineOf(store: StoreCardData): { text: string; tone: LineTone } | null {
  if (store.outOfArea) return { text: 'Não entrega aqui', tone: 'off' };
  if (store.status === 'fechada' && store.pausedBackAt) return { text: `Pausada · volta às ${store.pausedBackAt}`, tone: 'muted' };
  if (store.status === 'fechada') {
    return { text: store.opensAt ? `Loja fechada · abre às ${store.opensAt}` : 'Loja fechada', tone: 'muted' };
  }
  const eta = formatEtaRange(store.etaMin);
  if (!eta) return null;
  const tail = store.freeDelivery ? 'Frete grátis' : store.fee !== undefined ? formatMoney(store.fee) : '';
  return { text: tail ? `${eta} · ${tail}` : eta, tone: store.freeDelivery ? 'fast' : 'normal' };
}

/**
 * Loja no feed/busca. `destaque` = imagem em cima e texto embaixo (sem
 * gradiente nem overlay). `resultado` = LINHA com divisor, sem caixa: nome,
 * categoria, linha de entrega e StatusPill à direita.
 */
export function StoreCard({ variant, store, onClick }: StoreCardProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  const line = deliveryLineOf(store);
  const lineEl = line && (
    <div className={[styles.delivery, line.tone !== 'normal' ? styles[line.tone] : ''].join(' ').trim()}>{line.text}</div>
  );
  const interactiveProps = {
    role: 'button' as const,
    tabIndex: 0,
    onClick,
    onKeyDown: handleKeyDown,
  };

  if (variant === 'destaque') {
    return (
      <div className={styles.card} {...interactiveProps}>
        <span
          className={styles.image}
          style={store.imageUrl ? { backgroundImage: `url(${store.imageUrl})` } : undefined}
          aria-hidden="true"
        >
          {!store.imageUrl && <StoreIcon size={28} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}
        </span>
        <div className={styles.info}>
          <div>
            <div className={styles.name}>{store.name}</div>
            {lineEl}
          </div>
          <StatusPill status={store.status} />
        </div>
      </div>
    );
  }

  // Prazo só vem da cotação; a loja vitrine sem prazo mostra o selo "Vitrine" no lugar.
  const closed = store.status === 'fechada' || !!store.outOfArea;
  const eta = !closed ? formatEtaRange(store.etaMin) : null;
  const tail = store.freeDelivery ? 'Frete grátis' : store.fee !== undefined ? formatMoney(store.fee) : km(store.distanceKm);
  return (
    <div className={[styles.row, closed && styles.dim].filter(Boolean).join(' ')} {...interactiveProps}>
      <StoreLogo className={styles.logo} name={store.name} src={store.logoUrl} width={96} />
      <div className={styles.meta}>
        <div className={styles.rowName}>{store.name}</div>
        <div className={[styles.sub, store.outOfArea && styles.off].filter(Boolean).join(' ')}>{subLine(store)}</div>
      </div>
      <div className={styles.end}>
        {eta ? (
          <span className={styles.eta}><Zap size={14} aria-hidden="true" />{eta}</span>
        ) : store.vitrine && !closed ? (
          <Badge tone="status">Vitrine</Badge>
        ) : null}
        {tail && !store.outOfArea && (
          <span className={store.freeDelivery ? styles.free : styles.tail}>
            {store.freeDelivery && <Truck size={14} aria-hidden="true" />}
            {tail}
          </span>
        )}
      </div>
    </div>
  );
}
