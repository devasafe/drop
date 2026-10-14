import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import api from '../../../lib/api';
import { Button } from '../../ui/Button';
import { useAuth } from '../../../contexts/AuthContext';
import { useSaasConfig } from '../../../hooks/useSaasConfig';
import { useGamificationFeatures } from '../../../hooks/useGamificationFeatures';
import { formatMoney } from '../../../lib/money';
import { formatHour, unwrap } from '../../../lib/sellerApi';
import { formatPoints } from '../../../lib/motoboyLevel';
import blocks from '../../panel/PanelBlocks.module.css';
import { rideCode, transferStatusLabel } from './rideView';
import styles from './Corrida.module.css';

type Money =
  | { kind: 'loading' }
  | { kind: 'custodia'; amount: number; status: string }
  | { kind: 'direto'; amount: number; status: string }
  | { kind: 'unknown' };

const TAG = { ok: blocks.tagOk, warn: blocks.tagWarn, err: blocks.tagErr, info: blocks.tagInfo, neutral: '' } as const;

export interface ConcluidaViewProps {
  ride: any;
  points: { points: number; totalPoints: number } | null;
  onNext: () => void;
}

/** Fecha a corrida com o dinheiro do servidor (repasse ou Pix) e emenda a próxima. */
export function ConcluidaView({ ride, points, onNext }: ConcluidaViewProps) {
  const { user } = useAuth();
  const me = String(user?.id ?? user?._id ?? '');
  const mode = useSaasConfig();
  const { features } = useGamificationFeatures();
  const [money, setMoney] = useState<Money>({ kind: 'loading' });
  const [rating, setRating] = useState<{ rating: number; comment?: string } | null>(null);
  const direct = !mode.error && mode.settlementMode === 'direto';

  useEffect(() => {
    if (mode.loading) return undefined;
    if (mode.error) { setMoney({ kind: 'unknown' }); return undefined; }
    let alive = true;
    setMoney({ kind: 'loading' });
    const id = String(ride?._id ?? '');
    const orderId = String(ride?.orderId ?? '');
    const req = direct
      ? api.get('/motoboy/transfers').then((r: any) => {
          const list: any[] = unwrap<any[]>(r) || [];
          const t = Array.isArray(list) ? list.find((x) => String(x.orderId) === orderId && (x.reason ?? 'delivery') === 'delivery') : null;
          return t && Number.isFinite(Number(t.amount)) ? ({ kind: 'direto', amount: Number(t.amount), status: String(t.status) } as Money) : ({ kind: 'unknown' } as Money);
        })
      : api.get('/payouts/my', { params: { limit: 20 } }).then((r: any) => {
          const list: any[] = (Array.isArray(r?.data?.payouts) ? r.data.payouts : []).filter((x: any) => x?.status !== 'cancelled');
          let parts = list.filter((x) => String(x.deliveryId) === id);
          if (parts.length === 0) parts = list.filter((x) => String(x.orderId) === orderId && !x.deliveryId);
          if (parts.length === 0 || parts.some((x) => !Number.isFinite(Number(x.amount)))) return { kind: 'unknown' } as Money;
          const cents = parts.reduce((sum, x) => sum + Math.round(Number(x.amount) * 100), 0);
          const statuses = new Set(parts.map((x) => String(x.status)));
          return { kind: 'custodia', amount: cents / 100, status: statuses.size === 1 ? [...statuses][0] : '' } as Money;
        });
    req.then((m) => { if (alive) setMoney(m); }).catch(() => { if (alive) setMoney({ kind: 'unknown' }); });
    return () => { alive = false; };
  }, [mode.loading, mode.error, direct, ride?._id, ride?.orderId]);

  useEffect(() => {
    if (!me) return undefined;
    let alive = true;
    api.get(`/deliveries/motoboy/${me}/ratings`)
      .then((r: any) => {
        const first = Array.isArray(r?.data) ? r.data.find((x: any) => Number(x?.rating) > 0) : null;
        if (alive && first) setRating({ rating: Number(first.rating), comment: first.comment || undefined });
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [me]);

  const hour = formatHour(ride?.deliveredAt);
  const showPoints = features.gamificationPointsEnabled && !!points;
  const payoutNote = money.kind === 'custodia' ? (money.status === 'pending' ? 'a liberar' : money.status === 'released' ? 'disponível para saque' : '') : '';

  return (
    <div className={styles.screen}>
      <div className={styles.done}>
        <span className={`${styles.doneIcon} ${direct ? styles.doneIconLg : ''} ${styles.doneOk}`} aria-hidden="true"><CheckCircle2 size={direct ? 36 : 28} /></span>
        <h1 className={styles.doneTitle}>{direct ? 'Entregue!' : 'Entrega concluída'}</h1>
        <p className={styles.doneText}>
          {direct ? `Pedido #${rideCode(ride)}` : `Pedido #${rideCode(ride)} entregue${hour ? ` às ${hour}` : ''}.`}
        </p>
      </div>

      {direct ? (
        money.kind === 'direto' ? (
          <section className={`${blocks.blk} ${styles.center}`}>
            <span className={blocks.meta}>Pix a caminho da sua chave</span>
            <span className={blocks.big}>{formatMoney(money.amount)}</span>
            <span className={blocks.sub}>Quem paga é a loja, direto na sua chave Pix.</span>
            <span className={`${blocks.tag} ${TAG[transferStatusLabel(money.status).tone]}`}>{transferStatusLabel(money.status).label}</span>
          </section>
        ) : money.kind === 'loading' ? null : (
          <section className={`${blocks.blk} ${styles.center}`}><b>Veja em Ganhos</b><span className={blocks.meta}>O Pix desta entrega aparece lá.</span></section>
        )
      ) : (
        <div className={blocks.kpis}>
          <div className={blocks.kpi}>
            <small>Você ganhou</small>
            {money.kind === 'custodia' ? <b className={blocks.ok}>{formatMoney(money.amount)}</b> : money.kind === 'loading' ? <b>…</b> : <b>Veja em Ganhos</b>}
            {payoutNote && <em>{payoutNote}</em>}
          </div>
          {showPoints && (
            <div className={blocks.kpi}>
              <small>Pontos</small>
              <b>+{formatPoints(points!.points)}</b>
              <em>{formatPoints(points!.totalPoints)} no total</em>
            </div>
          )}
        </div>
      )}

      {direct && showPoints && (
        <div className={blocks.kpis}>
          <div className={blocks.kpi}><small>Pontos</small><b>+{formatPoints(points!.points)}</b><em>{formatPoints(points!.totalPoints)} no total</em></div>
        </div>
      )}

      {rating && (
        <section className={blocks.blk}>
          <div className={blocks.head}>
            <b className={blocks.headTitle}>Avaliação da última entrega</b>
            <span aria-label={`Nota ${rating.rating.toFixed(1).replace('.', ',')}`}>★ <b>{rating.rating.toFixed(1).replace('.', ',')}</b></span>
          </div>
          {rating.comment && <span className={blocks.sub}>{rating.comment}</span>}
        </section>
      )}

      <div className={styles.bar}>
        <Button onClick={onNext}>Procurar próxima corrida</Button>
        <small>Você continua online</small>
      </div>
    </div>
  );
}

export default ConcluidaView;
