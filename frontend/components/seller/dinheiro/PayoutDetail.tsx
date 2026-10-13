import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, FileText, Receipt, SearchX } from 'lucide-react';
import api from '../../../lib/api';
import { Alert } from '../../ui/Alert';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { OrderTimeline, type TimelineStep } from '../../drop/OrderTimeline';
import { OrderSummary } from '../../drop/OrderSummary';
import { StageTag } from '../StageTag';
import { PAYOUT_LABEL, PAYOUT_TONE } from './moneyLabels';
import { formatMoney } from '../../../lib/money';
import { paymentMethodLabel } from '../../../lib/paymentLabel';
import { shortOrderCode } from '../../../lib/customerOrder';
import { SELLER_ROUTES } from '../../../lib/sellerRoutes';
import { formatDateTime, formatHour } from '../../../lib/sellerApi';
import styles from './PayoutDetail.module.css';

function heroMeta(p: any): string {
  switch (p.status) {
    case 'released': return p.releasedAt ? `Disponível para sacar desde ${formatDateTime(p.releasedAt)}` : 'Disponível para sacar';
    case 'pending': return 'Libera depois da conferência da DROP.';
    case 'requested': return 'Saque pedido. O valor vai para a sua chave Pix.';
    case 'paid': return p.paidAt ? `Sacado em ${formatDateTime(p.paidAt)}` : 'Sacado';
    case 'cancelled': return `Cancelado${p.cancelReason ? `: ${p.cancelReason}` : ''}`;
    default: return '';
  }
}

function moneySteps(p: any, o: any | null, inv: any | null): TimelineStep[] {
  const t = (v: any) => formatHour(v) ?? undefined;
  const raw = [
    { label: 'Cliente pagou', time: t(o?.paidAt ?? o?.createdAt), detail: o ? [paymentMethodLabel(o.paymentMethod), o.customerName].filter(Boolean).join(' · ') : undefined, done: true },
    ...(inv?.pickedAt ? [{ label: 'Motoboy retirou', time: t(inv.pickedAt), detail: undefined as string | undefined, done: true }] : []),
    { label: 'Pedido entregue', time: t(inv?.deliveredAt ?? o?.delivery?.deliveredAt ?? p.createdAt), detail: 'Repasse criado como "a receber"', done: true },
    { label: 'Liberado pela DROP', time: t(p.releasedAt), detail: 'Pode sacar', done: !!p.releasedAt },
    { label: 'Sacado', time: t(p.paidAt), detail: undefined as string | undefined, done: p.status === 'paid' },
  ];
  if (p.status === 'cancelled') {
    return [
      ...raw.filter((s) => s.done).map((s) => ({ label: s.label, time: s.time, detail: s.detail, state: 'done' as const })),
      { label: 'Cancelado', detail: p.cancelReason || undefined, state: 'error' as const },
    ];
  }
  let current = false;
  return raw.map((s) => {
    if (s.done) return { label: s.label, time: s.time, detail: s.detail, state: 'done' as const };
    if (!current) { current = true; return { label: s.label, state: 'current' as const }; }
    return { label: s.label, state: 'upcoming' as const };
  });
}

export function PayoutDetail({ payoutId, storeId, onBack }: { payoutId: string; storeId: string; onBack: () => void }) {
  const [payout, setPayout] = useState<any | null | undefined>(undefined);
  const [order, setOrder] = useState<any | null>(null);
  const [invoice, setInvoice] = useState<any | null>(null);

  useEffect(() => {
    let off = false;
    setPayout(undefined);
    setOrder(null);
    setInvoice(null);
    api.get(`/payouts/my?storeId=${storeId}`)
      .then((r) => {
        if (off) return;
        const found = (r?.data?.payouts || []).find((p: any) => String(p._id) === payoutId) || null;
        setPayout(found);
        if (!found?.orderId) return;
        api.get(`/orders/${found.orderId}`).then((o) => { if (!off) setOrder(o?.data ?? null); }).catch(() => {});
        api.get(`/invoices/by-order/${found.orderId}`).then((i) => { if (!off) setInvoice(i?.data ?? null); }).catch(() => {});
      })
      .catch(() => { if (!off) setPayout(null); });
    return () => { off = true; };
  }, [payoutId, storeId]);

  const back = (
    <button type="button" className={styles.back} onClick={onBack}>
      <ChevronLeft size={18} aria-hidden="true" /> Voltar para Dinheiro
    </button>
  );

  if (payout === undefined) {
    return <div className={styles.stack}>{back}<div role="status" aria-label="Carregando" className={styles.stack}><Skeleton height={120} /><Skeleton height={180} /></div></div>;
  }
  if (payout === null) {
    return <div className={styles.stack}>{back}<EmptyState icon={<SearchX size={28} />} title="Repasse não encontrado" description="Ele pode ter sido cancelado ou ser de outra loja." /></div>;
  }

  const products: any[] = Array.isArray(order?.products) ? order.products : [];
  const itemsTotal = products.reduce((s, p) => s + (Number(p.price) || 0) * (Number(p.quantity) || 0), 0);
  const itemsCount = products.reduce((s, p) => s + (Number(p.quantity) || 0), 0);

  return (
    <div className={styles.stack}>
      {back}
      <div className={styles.head}>
        <h2 className={styles.title}>{`Pedido #${shortOrderCode(payout.orderId)}`}</h2>
        <StageTag label={PAYOUT_LABEL[payout.status] ?? payout.status} tone={PAYOUT_TONE[payout.status] ?? 'neutral'} />
      </div>

      <section className={styles.hero} aria-label="Você recebe">
        <span className={styles.heroLabel}>Você recebe</span>
        <b className={[styles.heroValue, payout.status === 'cancelled' ? styles.struck : ''].filter(Boolean).join(' ')}>{formatMoney(Number(payout.amount) || 0)}</b>
        <span className={styles.heroMeta}>{heroMeta(payout)}</span>
      </section>

      {payout.blocked && payout.status !== 'cancelled' && (
        <Alert tone="info" title="Valor bloqueado">
          {`${payout.blockReason || 'Em análise pela DROP'}. Se a análise for a seu favor, o valor é liberado; se não, volta para o cliente.`}
        </Alert>
      )}

      {order && (
        <section className={styles.block} aria-label="Valores do pedido">
          <OrderSummary
            lines={[
              { label: `Itens (${itemsCount})`, value: itemsTotal },
              { label: 'Frete (vai para o motoboy)', value: Number(order.deliveryFee) || 0 },
            ]}
            total={Number(payout.amount) || 0}
            totalLabel="Seu repasse"
          />
        </section>
      )}

      <section className={styles.block} aria-label="Caminho do dinheiro">
        <h3 className={styles.blockTitle}>Caminho do dinheiro</h3>
        <OrderTimeline steps={moneySteps(payout, order, invoice)} />
      </section>

      <nav className={styles.links} aria-label="Atalhos do repasse">
        {invoice?._id && (
          <Link href={`/invoice/${invoice._id}`} className={styles.link}>
            <FileText size={18} aria-hidden="true" /> Nota do pedido <small>Recibo com itens e taxas</small>
          </Link>
        )}
        <Link href={SELLER_ROUTES.pedido(String(payout.orderId))} className={styles.link}>
          <Receipt size={18} aria-hidden="true" /> Ver o pedido <small>{order?.customerName ? `${itemsCount} itens · ${order.customerName}` : 'Itens e andamento'}</small>
        </Link>
      </nav>
    </div>
  );
}
