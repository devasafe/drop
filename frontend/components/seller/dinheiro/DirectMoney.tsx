// frontend/components/seller/dinheiro/DirectMoney.tsx
import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import api from '../../../lib/api';
import { Alert } from '../../ui/Alert';
import { Skeleton } from '../../ui/Skeleton';
import MotoboyTransfersCard, { type TransferRow } from '../../drop/asaas/MotoboyTransfersCard';
import LegacyBalanceCard from '../../wallet/LegacyBalanceCard';
import { StuckPixSheet } from './StuckPixSheet';
import { SellerWithdrawSheet } from './SellerWithdrawSheet';
import { ASAAS_URL } from './moneyLabels';
import { formatMoney } from '../../../lib/money';
import { apiError, currentMonth, unwrap } from '../../../lib/sellerApi';
import styles from './DirectMoney.module.css';

interface DirectSummary {
  month: string;
  ordersPaid: { count: number; total: number };
  motoboyPix: { sentCount: number; sentTotal: number; stuckCount: number };
  refunds: { count: number; total: number };
}

/**
 * Dinheiro no modo SaaS: o dinheiro das vendas cai direto na conta Asaas da loja. Não há saldo
 * liberado nem saque de custódia aqui — só o saldo que sobrou do modo anterior (allowLeftover).
 */
export function DirectMoney({ storeId, hasLeftover }: { storeId: string; hasLeftover: boolean }) {
  const [sum, setSum] = useState<DirectSummary | null>(null);
  const [sumFailed, setSumFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [blockHours, setBlockHours] = useState<number | null>(null);
  const [minimum, setMinimum] = useState<number | null>(null);
  const [stuck, setStuck] = useState<TransferRow | null>(null);
  const [cardKey, setCardKey] = useState(0);
  const [released, setReleased] = useState(0);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [legacyBusy, setLegacyBusy] = useState(false);
  const [legacyError, setLegacyError] = useState<string | null>(null);
  const [legacyDone, setLegacyDone] = useState<string | null>(null);
  const [legacyAttempt, setLegacyAttempt] = useState(0);
  const month = currentMonth();
  const monthName = new Date().toLocaleDateString('pt-BR', { month: 'long' });

  useEffect(() => {
    let off = false;
    setSumFailed(false);
    api.get(`/stores/${storeId}/direct-summary?month=${month}`)
      .then((r) => { if (!off) setSum(unwrap<DirectSummary>(r)); })
      .catch(() => { if (!off) setSumFailed(true); });
    api.get('/settings/platform-config')
      .then((r) => {
        if (off) return;
        const cfg = unwrap<any>(r) || {};
        const h = Number(cfg.transferBlockHours);
        const m = Number(cfg.storeMinimumWithdraw);
        setBlockHours(Number.isFinite(h) && h > 0 ? h : null);
        setMinimum(Number.isFinite(m) && m > 0 ? m : null);
      })
      .catch(() => { /* prazo e mínimo são opcionais aqui */ });
    return () => { off = true; };
  }, [storeId, month, attempt]);

  useEffect(() => {
    if (!hasLeftover) { setReleased(0); return; }
    let off = false;
    api.get(`/payouts/my?storeId=${storeId}`)
      .then((r) => {
        if (off) return;
        const list: any[] = Array.isArray(r?.data?.payouts) ? r.data.payouts : [];
        const total = list.filter((p) => p.status === 'released').reduce((s, p) => s + (Number(p.amount) || 0), 0);
        setReleased(Math.round(total * 100) / 100);
      })
      .catch(() => { if (!off) setReleased(0); });
    return () => { off = true; };
  }, [hasLeftover, storeId, legacyAttempt]);

  const withdrawLegacy = async (amount: number | 'all') => {
    setLegacyBusy(true);
    setLegacyError(null);
    try {
      const r = await api.post('/withdrawals/request', { amount, storeId });
      const w = r?.data?.withdrawal;
      setLegacyOpen(false);
      setLegacyDone(w?.amount ? `Saque de ${formatMoney(Number(w.amount))} a caminho da sua chave Pix.` : 'Saque a caminho da sua chave Pix.');
      setLegacyAttempt((n) => n + 1);
    } catch (err) {
      setLegacyError(apiError(err).message || 'Não deu para pedir o saque agora.');
    } finally {
      setLegacyBusy(false);
    }
  };

  const stuckCount = sum?.motoboyPix?.stuckCount ?? 0;

  return (
    <div className={styles.stack}>
      {hasLeftover && <LegacyBalanceCard amount={released} onWithdraw={() => { setLegacyError(null); setLegacyOpen(true); }} />}
      {legacyDone && <p role="status" className={styles.notice}>{legacyDone}</p>}

      {sumFailed ? (
        <Alert tone="error" title="Não carregamos o resumo do mês" action={{ label: 'Tentar de novo', onClick: () => setAttempt((n) => n + 1) }}>
          Confira a conexão.
        </Alert>
      ) : !sum ? (
        <div role="status" aria-label="Carregando"><Skeleton height={140} /></div>
      ) : (
        <>
          <section className={styles.hero} aria-label="Recebido na sua conta Asaas">
            <span className={styles.heroLabel}>{`Recebido na sua conta Asaas · ${monthName}`}</span>
            <b className={styles.heroValue}>{formatMoney(Number(sum.ordersPaid?.total) || 0)}</b>
            <span className={styles.heroMeta}>
              {sum.ordersPaid?.count > 0
                ? `${sum.ordersPaid.count} ${sum.ordersPaid.count === 1 ? 'pedido pago' : 'pedidos pagos'} · caem direto na sua conta Asaas, sem saque`
                : 'As vendas por Pix aparecem aqui assim que caírem na sua conta.'}
            </span>
            <a className={styles.link} href={ASAAS_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} aria-hidden="true" /> Abrir o Asaas
            </a>
          </section>

          {stuckCount > 0 && (
            <Alert tone="error" title="Pix ao motoboy parado">
              {`${stuckCount === 1 ? '1 Pix não saiu' : `${stuckCount} Pix não saíram`}. Toque em "Ver o que fazer" na lista abaixo.`}
            </Alert>
          )}

          <div className={styles.kpis}>
            <div className={styles.kpi}>
              <small>Pago a motoboys</small>
              <b>{formatMoney(Number(sum.motoboyPix?.sentTotal) || 0)}</b>
              <em>{`${sum.motoboyPix?.sentCount ?? 0} ${sum.motoboyPix?.sentCount === 1 ? 'entrega' : 'entregas'}`}</em>
            </div>
            <div className={styles.kpi}>
              <small>Estornos</small>
              <b>{formatMoney(Number(sum.refunds?.total) || 0)}</b>
              <em>{`${sum.refunds?.count ?? 0} ${sum.refunds?.count === 1 ? 'pedido' : 'pedidos'}`}</em>
            </div>
          </div>
        </>
      )}

      <MotoboyTransfersCard key={cardKey} storeId={storeId} onOpen={setStuck} />

      <StuckPixSheet
        transfer={stuck}
        storeId={storeId}
        blockHours={blockHours}
        onClose={() => setStuck(null)}
        onRetried={() => setCardKey((k) => k + 1)}
      />
      <SellerWithdrawSheet
        open={legacyOpen}
        onClose={() => setLegacyOpen(false)}
        title="Sacar saldo do modo anterior"
        available={released}
        minimum={minimum}
        note="A chave é a de Dados de recebimento. Depois deste saque o card some."
        error={legacyError}
        submitting={legacyBusy}
        onConfirm={withdrawLegacy}
      />
    </div>
  );
}
