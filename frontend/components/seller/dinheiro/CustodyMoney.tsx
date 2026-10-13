// frontend/components/seller/dinheiro/CustodyMoney.tsx
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { ArrowUpRight, Wallet } from 'lucide-react';
import api from '../../../lib/api';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { StageTag } from '../StageTag';
import { SellerWithdrawSheet } from './SellerWithdrawSheet';
import { PAYOUT_LABEL, PAYOUT_TONE, isUncertainWithdrawal, withdrawalView } from './moneyLabels';
import { formatMoney } from '../../../lib/money';
import { shortOrderCode } from '../../../lib/customerOrder';
import { apiError, formatDayMonth, unwrap } from '../../../lib/sellerApi';
import styles from './CustodyMoney.module.css';

// nextReleaseAt existe no contrato mas vem sempre null (D10): não há liberação por prazo.
interface Summary { pending: number; available: number; requested: number; paid: number }
type Filter = 'todos' | 'vendas' | 'saques';

const UNCERTAIN_TEXT = 'Não peça de novo: estamos conferindo com o banco e avisamos aqui.';

/** Dinheiro no modo custódia: o que está a receber, o que já pode sacar e o que já saiu. */
export function CustodyMoney({ storeId, onOpenPayout }: { storeId: string; onOpenPayout: (payoutId: string) => void }) {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [minimum, setMinimum] = useState<number | null>(null);
  const [pix, setPix] = useState<{ has: boolean; key: string | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [needsPix, setNeedsPix] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('todos');

  const load = useCallback(async () => {
    setFailed(false);
    const [s, p, w, cfg, ob] = await Promise.allSettled([
      api.get(`/wallets/store/${storeId}/summary`),
      api.get(`/payouts/my?storeId=${storeId}`),
      api.get(`/withdrawals/my-withdrawals?storeId=${storeId}`),
      api.get('/settings/platform-config'),
      api.get('/onboarding/status'),
    ]);
    if (s.status === 'fulfilled') setSummary(unwrap<Summary>(s.value)); else setFailed(true);
    if (p.status === 'fulfilled') {
      const d = unwrap<any>(p.value);
      setPayouts(Array.isArray(d?.payouts) ? d.payouts : []);
    }
    if (w.status === 'fulfilled') {
      const d = unwrap<any>(w.value);
      setWithdrawals(Array.isArray(d) ? d : Array.isArray(d?.withdrawals) ? d.withdrawals : []);
    }
    if (cfg.status === 'fulfilled') {
      // Decimal do Prisma pode chegar como string ("10.00").
      const m = Number(unwrap<any>(cfg.value)?.storeMinimumWithdraw);
      setMinimum(Number.isFinite(m) && m > 0 ? m : null);
    }
    if (ob.status === 'fulfilled') {
      const d = unwrap<any>(ob.value) || {};
      setPix({ has: !!d.hasPixKey, key: typeof d.pixKey === 'string' ? d.pixKey : null });
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load, attempt]);

  if (failed && !summary) {
    return <EmptyState variant="error" icon={<Wallet size={28} />} title="Não carregamos o seu dinheiro" description="Confira a conexão." onRetry={() => setAttempt((n) => n + 1)} />;
  }
  if (!summary) {
    return <div role="status" aria-label="Carregando" className={styles.stack}><Skeleton height={140} /><Skeleton height={120} /></div>;
  }

  const available = Number(summary.available) || 0;
  const pending = Number(summary.pending) || 0;
  const requested = Number(summary.requested) || 0;
  const paid = Number(summary.paid) || 0;
  const uncertain = withdrawals.some(isUncertainWithdrawal);
  const belowMin = minimum !== null && available > 0 && available < minimum;
  const noPix = pix !== null && !pix.has;
  const canWithdraw = available > 0 && !belowMin && !uncertain && !noPix;
  const blocked = payouts.filter((p) => p.blocked && p.status !== 'paid' && p.status !== 'cancelled');
  const blockedTotal = blocked.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const confirm = async (amount: number | 'all') => {
    setSubmitting(true);
    setSheetError(null);
    setNeedsPix(false);
    try {
      const r = await api.post('/withdrawals/request', { amount, storeId });
      const w = unwrap<any>(r)?.withdrawal;
      setSheet(false);
      setDone(w?.amount ? `Saque de ${formatMoney(Number(w.amount))} pedido. O valor vai para a sua chave Pix.` : 'Saque pedido. O valor vai para a sua chave Pix.');
      await load();
    } catch (err) {
      const data = (err as any)?.response?.data;
      // 400 BELOW_MINIMUM_WITHDRAW traz o mínimo atual do servidor: passa a valer na tela.
      const serverMin = Number(data?.minimum);
      if (Number.isFinite(serverMin) && serverMin > 0) setMinimum(serverMin);
      setSheetError(apiError(err).message || 'Não deu para pedir o saque agora.');
      setNeedsPix(data?.action === '/dados-recebimento');
    } finally {
      // Volta a false em todo envio: é isso que destrava o envio único do sheet.
      setSubmitting(false);
    }
  };

  const entries = [
    ...payouts.map((p) => ({
      key: `p-${p._id}`,
      kind: 'vendas' as const,
      date: p.releasedAt || p.createdAt,
      title: `#${shortOrderCode(p.orderId)}`,
      status: { label: PAYOUT_LABEL[p.status] ?? p.status, tone: PAYOUT_TONE[p.status] ?? 'neutral' },
      amount: `${p.status === 'cancelled' ? '' : '+'}${formatMoney(Number(p.amount) || 0)}`,
      positive: p.status !== 'cancelled',
      payoutId: String(p._id),
    })),
    ...withdrawals.map((w, i) => ({
      key: `w-${w._id || w.id || i}`,
      kind: 'saques' as const,
      date: w.requestedAt || w.createdAt,
      title: 'Saque Pix',
      status: withdrawalView(w),
      amount: `−${formatMoney(Number(w.amount) || 0)}`,
      positive: false,
      payoutId: null as string | null,
    })),
  ]
    .filter((e) => filter === 'todos' || e.kind === filter)
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));

  return (
    <div className={styles.stack}>
      <section className={styles.hero} aria-label="Disponível para sacar">
        <span className={styles.heroLabel}>Disponível para sacar</span>
        <b className={styles.heroValue}>{formatMoney(available)}</b>
        {pending > 0 && (
          <span className={styles.heroMeta}>{`+ ${formatMoney(pending)} a receber, liberado depois da entrega`}</span>
        )}
        <Button onClick={() => { setSheetError(null); setNeedsPix(false); setSheet(true); }} disabled={!canWithdraw} leftIcon={<ArrowUpRight size={18} aria-hidden="true" />}>
          Sacar para meu Pix
        </Button>
        {belowMin && minimum !== null && <span className={styles.heroHint}>{`O saque mínimo é ${formatMoney(minimum)}`}</span>}
        {available <= 0 && pending <= 0 && payouts.length === 0 && (
          <span className={styles.heroHint}>Seu primeiro valor aparece aqui depois da primeira entrega.</span>
        )}
      </section>

      {done && <p role="status" className={styles.notice}>{done}</p>}
      {uncertain && (
        <Alert tone="warning" title="Saque em conferência">{UNCERTAIN_TEXT}</Alert>
      )}
      {noPix && (
        <Alert tone="info" title="Cadastre sua chave Pix para sacar" action={{ label: 'Cadastrar chave', onClick: () => router.push('/seller/abrir') }}>
          O saque cai na chave Pix da loja.
        </Alert>
      )}
      {needsPix && (
        <Alert tone="warning" title="Falta configurar o recebimento" action={{ label: 'Configurar agora', onClick: () => router.push('/seller/abrir') }}>
          {sheetError || 'Confira a chave Pix da loja.'}
        </Alert>
      )}
      {blockedTotal > 0 && (
        <Alert tone="info" title={`${formatMoney(blockedTotal)} bloqueados`}>
          {`${blocked[0]?.blockReason || 'Em análise pela DROP'}. Volta para você se a análise for a seu favor.`}
        </Alert>
      )}

      <section className={styles.block} aria-label="Para onde vai o seu dinheiro">
        <h2 className={styles.blockTitle}>Para onde vai o seu dinheiro</h2>
        <dl className={styles.flow}>
          <div><dt>A receber<small>liberado depois da entrega</small></dt><dd>{formatMoney(pending)}</dd></div>
          <div><dt>Liberado<small>pronto para sacar</small></dt><dd>{formatMoney(available)}</dd></div>
          {requested > 0 && <div><dt>Saque a caminho<small>pedido, ainda não caiu</small></dt><dd>{formatMoney(requested)}</dd></div>}
          <div><dt>Sacado<small>já foi para a sua chave Pix</small></dt><dd>{formatMoney(paid)}</dd></div>
        </dl>
      </section>

      <section className={styles.block} aria-label="Extrato">
        <div className={styles.blockHead}>
          <h2 className={styles.blockTitle}>Extrato</h2>
          <div className={styles.chips}>
            <Chip label="Todos" active={filter === 'todos'} onClick={() => setFilter('todos')} />
            <Chip label="Vendas" active={filter === 'vendas'} onClick={() => setFilter('vendas')} />
            <Chip label="Saques" active={filter === 'saques'} onClick={() => setFilter('saques')} />
          </div>
        </div>
        {entries.length === 0 ? (
          <p className={styles.meta}>Nada por aqui ainda.</p>
        ) : (
          <table className={styles.table}>
            <caption className={styles.srOnly}>Extrato</caption>
            <thead>
              <tr><th scope="col">Data</th><th scope="col">Descrição</th><th scope="col">Situação</th><th scope="col">Valor</th></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.key}>
                  <td className={styles.cDate}>{formatDayMonth(e.date) ?? '—'}</td>
                  <td className={styles.cDesc}>
                    {e.payoutId ? (
                      <button type="button" className={styles.linkBtn} onClick={() => onOpenPayout(e.payoutId as string)} aria-label={`Repasse do pedido ${e.title}`}>
                        {e.title}
                      </button>
                    ) : e.title}
                  </td>
                  <td className={styles.cStatus}><StageTag label={e.status.label} tone={e.status.tone} /></td>
                  <td className={[styles.cAmount, e.positive ? styles.credit : ''].filter(Boolean).join(' ')}>{e.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <SellerWithdrawSheet
        open={sheet}
        onClose={() => setSheet(false)}
        available={available}
        minimum={minimum}
        pixLabel={pix?.key}
        note={pending > 0 ? `Fica em Dinheiro: ${formatMoney(pending)} a receber, liberado depois da entrega.` : null}
        blocked={uncertain ? UNCERTAIN_TEXT : null}
        error={sheetError}
        submitting={submitting}
        onConfirm={confirm}
      />
    </div>
  );
}
