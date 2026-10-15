import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { FileText, LifeBuoy, SearchX, Star, TriangleAlert } from 'lucide-react';
import api from '../../../lib/api';
import MotoboyShell from '../panel/MotoboyShell';
import RouteThumbnail from '../../map/RouteThumbnail';
import { NavRow } from '../../panel/NavRow';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { useMotoboyMoney } from '../../../hooks/useMotoboyMoney';
import { moneyBadge } from '../../../lib/motoboyMoney';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';
import { formatMoney } from '../../../lib/money';
import { shortOrderCode } from '../../../lib/customerOrder';
import { apiError, formatHour } from '../../../lib/sellerApi';
import { moneyTagClass } from '../moneyTag';
import blocks from '../../panel/PanelBlocks.module.css';
import styles from './EntregaDetail.module.css';

const BACK = MOTOBOY_ROUTES.entregas('concluidas');
/** Número vindo do servidor (Decimal em string); vazio ou inválido → NaN (nunca 0). */
const num = (v: unknown) => (v === null || v === undefined || v === '' ? NaN : Number(v));
const shortName = (name: unknown): string => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'o cliente';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
};
const point = (lat: unknown, lng: unknown) => {
  const a = Number(lat);
  const b = Number(lng);
  return lat !== null && lat !== undefined && Number.isFinite(a) && Number.isFinite(b) ? { lat: a, lng: b } : null;
};
const decimal = (n: number) => String(n).replace('.', ',');

type InvoiceState = 'loading' | 'ready' | 'none' | 'cancelled' | 'error';

/**
 * Detalhe de uma corrida encerrada (protótipo "Detalhe da entrega"): prova o que aconteceu, mostra a
 * conta da nota fiscal (números gravados pelo servidor no finalizarEntrega) e a avaliação do cliente.
 * Nada de dinheiro é calculado aqui: sem nota → sem conta; cancelada → a compensação do servidor.
 */
export function EntregaDetail({ id }: { id: string }) {
  const router = useRouter();
  const [delivery, setDelivery] = useState<any | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let off = false;
    setState('loading');
    Promise.resolve()
      .then(() => api.get(`/deliveries/${id}`))
      .then((r: any) => {
        if (off) return;
        const d = r?.data;
        if (!d) { setState('notfound'); return; }
        if (d.status === 'assigned' || d.status === 'picked') { router.replace(MOTOBOY_ROUTES.corrida(id)); return; }
        setDelivery(d);
        setState('ready');
      })
      .catch((err) => {
        if (off) return;
        const s = apiError(err).status;
        setState(s === 404 || s === 403 ? 'notfound' : 'error');
      });
    return () => { off = true; };
    // router fora das dependências: o replace só roda quando a corrida carrega ativa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, attempt]);

  if (state === 'loading') {
    return (
      <MotoboyShell title="Corrida" back={BACK}>
        <div role="status" aria-label="Carregando" className={blocks.stack}><Skeleton height={140} /><Skeleton height={160} /></div>
      </MotoboyShell>
    );
  }
  if (state !== 'ready' || !delivery) {
    return (
      <MotoboyShell title="Corrida" back={BACK}>
        {state === 'error' ? (
          <EmptyState variant="error" icon={<TriangleAlert size={28} aria-hidden="true" />} title="Não carregamos esta corrida" description="Confira a conexão." onRetry={() => setAttempt((n) => n + 1)} />
        ) : (
          <EmptyState icon={<SearchX size={28} aria-hidden="true" />} title="Corrida não encontrada" action={<Button onClick={() => router.push(BACK)}>Ver suas entregas</Button>} />
        )}
      </MotoboyShell>
    );
  }
  return <EntregaLoaded delivery={delivery} />;
}

/** A corrida já carregada: só aqui o dinheiro é lido, com a janela do createdAt dela. */
function EntregaLoaded({ delivery }: { delivery: any }) {
  const router = useRouter();
  const money = useMotoboyMoney({ since: delivery.createdAt ?? null });
  const [invoice, setInvoice] = useState<any | null>(null);
  const [invoiceState, setInvoiceState] = useState<InvoiceState>('loading');
  const [invoiceAttempt, setInvoiceAttempt] = useState(0);

  const orderId = delivery.orderId ? String(delivery.orderId) : null;
  const deliveryId = String(delivery._id ?? delivery.id ?? '');
  // Só a corrida entregue tem nota; a cancelada mostra a compensação do servidor (sem GET de 404 esperado).
  const wantsInvoice = delivery.status === 'delivered' && !!orderId;
  useEffect(() => {
    if (!wantsInvoice || !orderId) { setInvoice(null); setInvoiceState('none'); return undefined; }
    let off = false;
    setInvoiceState('loading');
    Promise.resolve()
      .then(() => api.get(`/invoices/by-order/${encodeURIComponent(orderId)}`))
      .then((r: any) => {
        if (off) return;
        const raw = r?.data ?? null;
        // A nota é buscada pelo pedido (findFirst): a de outra entrega do mesmo pedido não é desta corrida.
        const inv = raw && (raw.deliveryId === undefined || raw.deliveryId === null || String(raw.deliveryId) === deliveryId) ? raw : null;
        setInvoice(inv);
        setInvoiceState(!inv ? 'none' : inv.status === 'cancelled' ? 'cancelled' : 'ready');
      })
      .catch((err) => {
        if (off) return;
        setInvoice(null);
        // 404 (sem nota) e 403 (nota que não é sua): não há conta; repetir não muda nada.
        const st = apiError(err).status;
        setInvoiceState(st === 404 || st === 403 ? 'none' : 'error');
      });
    return () => { off = true; };
  }, [wantsInvoice, orderId, deliveryId, invoiceAttempt]);

  const delivered = delivery.status === 'delivered';
  const n = Number(delivery.distance);
  const km = Number.isFinite(n) && n > 0 ? `${n.toFixed(1).replace('.', ',')} km` : null;
  const address = delivery.deliveryAddress && delivery.deliveryAddress !== '-' ? delivery.deliveryAddress : null;
  const steps = [
    delivery.assignedAt ? { key: 'a', label: 'Aceitou a corrida', sub: null, at: delivery.assignedAt, cancel: false } : null,
    delivery.pickedAt ? { key: 'p', label: `Retirou na ${delivery.storeObj?.name || 'loja'}`, sub: delivery.storeObj?.address || null, at: delivery.pickedAt, cancel: false } : null,
    delivered && delivery.deliveredAt
      ? { key: 'd', label: `Entregou para ${shortName(delivery.customerObj?.name)}`, sub: [address, km].filter(Boolean).join(' · ') || null, at: delivery.deliveredAt, cancel: false }
      : null,
    !delivered && delivery.cancelledAt ? { key: 'c', label: 'Corrida cancelada', sub: null, at: delivery.cancelledAt, cancel: true } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; sub: string | null; at: string; cancel: boolean }>;

  // moneyOf respeita a cobertura da leitura e casa pela corrida: sem dado → sem badge.
  const m = money.status === 'ready' ? money.moneyOf(delivery) : null;
  const badge = m ? moneyBadge(m) : null;
  const fee = num(invoice?.deliveryFee);
  const cut = num(invoice?.appCommission);
  const pct = num(invoice?.commissionPercent);
  const mine = num(invoice?.motoboyAmount);
  const invoiceOk = invoiceState === 'ready' && [fee, cut, mine].every(Number.isFinite);
  const comp = delivery.cancellationCompensation;
  const compOk = !delivered && typeof comp === 'number' && Number.isFinite(comp) && comp > 0;
  const rating = num(delivery.rating);
  const rated = Number.isFinite(rating) && rating > 0;
  const comment = typeof delivery.comment === 'string' && delivery.comment.trim() ? delivery.comment.trim() : null;
  const store = point(delivery.pickupLat, delivery.pickupLng);
  const customer = point(delivery.deliveryLat, delivery.deliveryLng);
  const issuedHour = invoiceOk ? formatHour(invoice.issuedAt) : null;

  return (
    <MotoboyShell
      title={`Corrida #${shortOrderCode(delivery.orderId || delivery._id)}`}
      back={BACK}
      actions={<span className={[blocks.tag, delivered ? blocks.tagOk : blocks.tagWarn].join(' ')}>{delivered ? 'Entregue' : 'Cancelada'}</span>}
    >
      <div className={blocks.stack}>
        {store && customer && <RouteThumbnail store={store} customer={customer} polyline={delivery.routePolyline ?? null} height={140} />}

        {steps.length > 0 && (
          <section className={blocks.blk} aria-label="Linha do tempo">
            <ol className={styles.tl}>
              {steps.map((s) => (
                <li key={s.key} className={s.cancel ? styles.stepCancel : styles.step}>
                  <span className={styles.stepText}>{s.label}{s.sub && <small>{s.sub}</small>}</span>
                  <time className={blocks.time}>{formatHour(s.at)}</time>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className={blocks.blk} aria-label="Seu ganho">
          <h2 className={blocks.headTitle}>Seu ganho</h2>
          {invoiceOk ? (
            <div className={blocks.sum}>
              <div><span>Taxa de entrega</span><span>{formatMoney(fee)}</span></div>
              {cut > 0 && (
                <div><span>{`Parte da DROP (${Number.isFinite(pct) ? decimal(pct) : '—'}%)`}</span><span>{`− ${formatMoney(cut)}`}</span></div>
              )}
              <div className={styles.total}><span>Você recebe</span><span>{formatMoney(mine)}</span></div>
            </div>
          ) : compOk ? (
            <div className={blocks.sum}>
              <div className={styles.total}><span>Compensação do cancelamento</span><span>{formatMoney(comp)}</span></div>
            </div>
          ) : invoiceState === 'loading' ? (
            <Skeleton height={72} />
          ) : invoiceState === 'error' ? (
            <>
              <p className={blocks.errText}>Não carregamos a conta desta corrida.</p>
              <button type="button" className={blocks.link} onClick={() => setInvoiceAttempt((x) => x + 1)}>Tentar de novo</button>
            </>
          ) : invoiceState === 'cancelled' ? (
            <p className={blocks.meta}>A nota desta corrida foi cancelada.</p>
          ) : delivered ? (
            <p className={blocks.meta}>A conta aparece quando a nota da corrida for emitida.</p>
          ) : (
            // cancelada sem compensação > 0 (null, 0 ou valor estranho): nunca seção vazia nem R$ 0,00
            <p className={blocks.meta}>Corrida cancelada sem compensação.</p>
          )}
          {badge && <span className={[moneyTagClass(badge.tone), styles.badge].join(' ')}>{badge.label}</span>}
        </section>

        {delivered && (
          <section className={blocks.blk} aria-label="Avaliação do cliente">
            <div className={blocks.head}>
              <h2 className={blocks.headTitle}>Avaliação do cliente</h2>
              {rated && (
                <span className={styles.stars} aria-label={`Nota ${rating.toFixed(1).replace('.', ',')}`}>
                  <Star size={14} aria-hidden="true" className={styles.star} /> <b>{rating.toFixed(1).replace('.', ',')}</b>
                </span>
              )}
            </div>
            {rated
              ? comment && <p className={blocks.sub}>{comment}</p>
              : <p className={blocks.meta}>O cliente ainda não avaliou esta entrega.</p>}
          </section>
        )}

        <ul className={blocks.list}>
          {invoiceOk && (
            <NavRow
              icon={<FileText size={18} />}
              label="Nota fiscal da corrida"
              sub={`NFS-e ${invoice.invoiceNumber}${issuedHour ? ` · emitida às ${issuedHour}` : ''}`}
              onClick={() => router.push(`/invoice/${encodeURIComponent(String(invoice.id ?? invoice._id))}`)}
            />
          )}
          {/* C7: /suporte até a P5.5 trocar para MOTOBOY_ROUTES.perfilAjuda. */}
          <NavRow icon={<LifeBuoy size={18} />} label="Algo errado com esta corrida?" sub="Falar com o suporte" onClick={() => router.push('/suporte')} />
        </ul>
      </div>
    </MotoboyShell>
  );
}

export default EntregaDetail;
