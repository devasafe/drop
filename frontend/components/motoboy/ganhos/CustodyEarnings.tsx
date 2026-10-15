// frontend/components/motoboy/ganhos/CustodyEarnings.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { ArrowUpRight, Lock, ShieldAlert, Wallet } from 'lucide-react';
import api from '../../../lib/api';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { Tabs, tabPanelProps } from '../../ui/Tabs';
import { WithdrawPixSheet } from './WithdrawPixSheet';
import { moneyTagClass, stageTagClass } from '../moneyTag';
import { isUncertainWithdrawal, withdrawalView } from '../../seller/dinheiro/moneyLabels';
import { useMotoboyRules } from '../../../hooks/useMotoboyRules';
import { useMotoboyMoney, type MotoboyMoney } from '../../../hooks/useMotoboyMoney';
import { useSocket } from '../../../contexts/SocketContext';
import { MOTOBOY_ROUTES, type GanhosSeg } from '../../../lib/motoboyRoutes';
import { isThisWeek, moneyBadge, payoutToMoney, weekBars, windowCovered, type MoneyInfo, type WeekBars } from '../../../lib/motoboyMoney';
import { formatMoney } from '../../../lib/money';
import { shortOrderCode } from '../../../lib/customerOrder';
import { apiError, formatDateTime } from '../../../lib/sellerApi';
import { weekFromResponse, type Week } from './weekSummary';
import blocks from '../../panel/PanelBlocks.module.css';
import styles from './Ganhos.module.css';

interface Summary { pending: number; available: number; requested: number; paid: number }
const UNCERTAIN_TEXT = 'Não peça de novo: estamos conferindo com o banco e avisamos aqui.';

const toSummary = (d: any): Summary | null => {
  const s = { pending: Number(d?.pending), available: Number(d?.available), requested: Number(d?.requested), paid: Number(d?.paid) };
  return Object.values(s).every(Number.isFinite) ? s : null;
};
const toList = (d: any): any[] => (Array.isArray(d) ? d : Array.isArray(d?.withdrawals) ? d.withdrawals : []);
const ms = (iso: string | null): number => (iso ? new Date(iso).getTime() : NaN);

export interface CustodyEarningsProps { motoboyId: string; seg: GanhosSeg; onSeg: (s: GanhosSeg) => void; now?: Date }

/**
 * Ganhos na custódia (protótipo "Ganhos" + "Sacar"). Mesmas rotas e regras da carteira antiga.
 * "Esta semana" vem só de /deliveries/summary (K35); as barras ficam no cliente, com a janela inteira.
 * O dinheiro de cada corrida vem de useMotoboyMoney().moneyOf (cobertura da leitura, Task 37).
 */
export function CustodyEarnings({ motoboyId, seg, onSeg, now = new Date() }: CustodyEarningsProps) {
  const router = useRouter();
  const { onReconnect } = useSocket();
  const { rules } = useMotoboyRules();
  // Sem `since`: a aba Corridas mostra todas as corridas com repasse (as linhas saem do próprio índice).
  const money = useMotoboyMoney();
  const [available, setAvailable] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  // K29: sem o resumo, o "a liberar" é desconhecido (nunca R$ 0,00 nem a linha sumindo calada).
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [week, setWeek] = useState<Week | null>(null);
  const [weekFailed, setWeekFailed] = useState(false);
  const [payouts, setPayouts] = useState<MoneyInfo[]>([]);
  const [payoutsMore, setPayoutsMore] = useState(true);
  const [payoutsFailed, setPayoutsFailed] = useState(false);
  const [withdrawals, setWithdrawals] = useState<any[] | null>(null);
  const [pix, setPix] = useState<{ has: boolean; key: string | null } | null>(null);
  const [invoices, setInvoices] = useState<any[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [serverMin, setServerMin] = useState<number | null>(null);
  const [needsPix, setNeedsPix] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    const call = (u: string, cfg?: any) => Promise.resolve().then(() => (cfg ? api.get(u, cfg) : api.get(u)));
    const [w, p, s, wd, ob, inv, sm] = await Promise.allSettled([
      call(`/wallets/motoboy/${motoboyId}`),
      call('/payouts/my', { params: { limit: 200 } }),
      call('/payouts/my/summary'),
      call('/withdrawals/my-withdrawals'),
      call('/onboarding/status'),
      call('/invoices/my', { params: { limit: 200 } }),
      call('/deliveries/summary'),
    ]);
    if (my !== seq.current) return; // leitura velha: outra recarga já começou ou a tela saiu
    let v = NaN;
    if (w.status === 'fulfilled') {
      const d = w.value?.data || {};
      // Mesma regra da carteira antiga: availableBalance, senão balance, senão 0.
      v = Number(d.availableBalance ?? d.balance ?? 0);
    }
    // Erro (ou valor estranho) limpa o valor velho: nunca R$ 0,00 nem o saldo de antes.
    setAvailable(Number.isFinite(v) ? v : null);
    setFailed(!Number.isFinite(v));
    if (p.status === 'fulfilled') {
      const d = p.value?.data || {};
      const list = (Array.isArray(d.payouts) ? d.payouts : []).map(payoutToMoney).filter(Boolean) as MoneyInfo[];
      setPayouts(list);
      setPayoutsMore(typeof d.total === 'number' ? list.length < d.total : true);
      setPayoutsFailed(false);
    } else {
      // K29: sem a lista não há bloqueado nem barras (fail closed), e a aba Corridas mostra o erro.
      setPayouts([]);
      setPayoutsMore(true);
      setPayoutsFailed(true);
    }
    const sum = s.status === 'fulfilled' ? toSummary(s.value?.data) : null;
    setSummary(sum);
    setSummaryFailed(!sum);
    setWithdrawals(wd.status === 'fulfilled' ? toList(wd.value?.data) : null);
    if (ob.status === 'fulfilled') {
      const d = ob.value?.data || {};
      setPix({ has: !!d.hasPixKey, key: typeof d.pixKey === 'string' && d.pixKey ? d.pixKey : null });
    }
    if (inv.status === 'fulfilled') setInvoices(Array.isArray(inv.value?.data?.invoices) ? inv.value.data.invoices : []);
    else setInvoices(null);
    const wk = sm.status === 'fulfilled' ? weekFromResponse(sm.value) : null;
    setWeek(wk);
    setWeekFailed(!wk);
  }, [motoboyId]);

  useEffect(() => { load(); }, [load, attempt]);
  useEffect(() => () => { seq.current += 1; }, []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => onReconnect(retry), [onReconnect, retry]);

  if (available === null) {
    return failed ? (
      <EmptyState variant="error" icon={<Wallet size={28} aria-hidden="true" />} title="Não carregamos seus ganhos" description="Confira a conexão." onRetry={retry} />
    ) : (
      <div role="status" aria-label="Carregando" className={styles.stack}><Skeleton height={150} /><Skeleton height={96} /></div>
    );
  }

  const minimum = serverMin ?? rules?.minimumWithdraw ?? null;
  const uncertain = withdrawals !== null && withdrawals.some(isUncertainWithdrawal);
  const withdrawalsUnknown = withdrawals === null;
  const belowMin = minimum !== null && available > 0 && available < minimum - 0.005;
  const noPix = pix !== null && !pix.has;
  const canWithdraw = available > 0 && !belowMin && !uncertain && !withdrawalsUnknown && !noPix;
  // null = não sabemos o a liberar (resumo com erro): a tela mostra o erro e a sheet não soma.
  const pending: number | null = summaryFailed ? null : summary?.pending ?? 0;
  const blockedList = payouts.filter((m) => m.blocked && m.status !== 'paid' && m.status !== 'cancelled');
  const blockedTotal = blockedList.reduce((s, m) => s + Math.round(m.amount * 100), 0) / 100;
  const showBlocked = !payoutsFailed && !payoutsMore && blockedTotal > 0;
  const weekOk = !payoutsFailed && windowCovered(payouts.map((m) => m.createdAt), payoutsMore, (iso) => isThisWeek(iso, now));

  const confirm = async (amount: number | 'all') => {
    if (available <= 0) return;
    setSubmitting(true);
    setSheetError(null);
    setNeedsPix(false);
    try {
      const r = await api.post('/withdrawals/request', { amount });
      const v = Number(r?.data?.withdrawal?.amount);
      // Fecha a sheet ANTES de reler: com ela aberta, um `available` novo zeraria o campo.
      setSheet(false);
      setDone(Number.isFinite(v) && v > 0 ? `Saque de ${formatMoney(v)} pedido. O valor vai para a sua chave Pix.` : 'Saque pedido. O valor vai para a sua chave Pix.');
      retry();
      money.reload();
    } catch (err) {
      const data = (err as any)?.response?.data;
      // 400 BELOW_MINIMUM_WITHDRAW traz o mínimo atual do servidor: passa a valer na tela.
      const m = Number(data?.minimum);
      if (Number.isFinite(m) && m > 0) setServerMin(m);
      setSheetError(apiError(err).message || 'Não deu para pedir o saque agora. Confira sua chave Pix em Dados de recebimento.');
      setNeedsPix(data?.action === '/dados-recebimento');
    } finally {
      // Volta a false em todo envio: é isso que destrava o envio único da sheet.
      setSubmitting(false);
    }
  };

  const retryRides = () => {
    if (payoutsFailed) retry();
    money.reload();
  };

  let hint: JSX.Element | null = null;
  if (belowMin && minimum !== null) {
    hint = <span className={blocks.meta}>{`Faltam ${formatMoney(minimum - available)} para o saque mínimo de ${formatMoney(minimum)}`}</span>;
  } else if (withdrawalsUnknown) {
    hint = (
      <span className={blocks.meta}>
        Não conferimos seus saques agora.{' '}
        <button type="button" className={blocks.link} onClick={retry}>Tentar de novo</button>
      </span>
    );
  } else if (minimum !== null) {
    hint = <span className={blocks.meta}>{`Saque mínimo de ${formatMoney(minimum)}${pix?.key ? ` · cai na chave ${pix.key}` : ''}`}</span>;
  }

  return (
    <div className={styles.stack}>
      <section className={blocks.blk} aria-label="Disponível para saque">
        <span className={blocks.meta}>Disponível para saque</span>
        <b className={blocks.big}>{formatMoney(available)}</b>
        <Button onClick={() => { setSheetError(null); setNeedsPix(false); setSheet(true); }} disabled={!canWithdraw} leftIcon={<ArrowUpRight size={18} aria-hidden="true" />}>
          Sacar no Pix
        </Button>
        {hint}
      </section>

      {done && <p role="status" className={blocks.meta}>{done}</p>}
      {uncertain && <Alert tone="warning" title="Saque em conferência">{UNCERTAIN_TEXT}</Alert>}
      {noPix && (
        <Alert tone="info" title="Cadastre sua chave Pix para sacar" action={{ label: 'Cadastrar chave', onClick: () => router.push(MOTOBOY_ROUTES.recebimento) }}>
          O saque cai na chave Pix cadastrada em Dados de recebimento.
        </Alert>
      )}
      {needsPix && (
        <Alert tone="warning" title="Falta configurar o recebimento" action={{ label: 'Configurar agora', onClick: () => router.push(MOTOBOY_ROUTES.recebimento) }}>
          {sheetError || 'Confira sua chave Pix.'}
        </Alert>
      )}

      {(pending === null || pending > 0 || showBlocked) && (
        <ul className={blocks.list}>
          {pending === null && (
            <li className={blocks.row}>
              <span className={[blocks.ico, blocks.icoWarn].join(' ')} aria-hidden="true"><Lock size={18} /></span>
              <p className={blocks.errText}>
                Não carregamos o valor a liberar.{' '}
                <button type="button" className={blocks.link} onClick={retry}>Tentar de novo</button>
              </p>
            </li>
          )}
          {pending !== null && pending > 0 && (
            <li className={blocks.row}>
              <span className={[blocks.ico, blocks.icoWarn].join(' ')} aria-hidden="true"><Lock size={18} /></span>
              <span className={blocks.tx}>
                <b>{`${formatMoney(pending)} a liberar`}</b>
                <span>{rules?.autoApprovePayouts ? 'Corridas recentes, liberam logo depois da entrega' : 'Corridas recentes, liberam depois da aprovação da equipe'}</span>
              </span>
            </li>
          )}
          {showBlocked && (
            <li className={blocks.row}>
              <span className={[blocks.ico, blocks.icoErr].join(' ')} aria-hidden="true"><ShieldAlert size={18} /></span>
              <span className={blocks.tx}>
                <b>{`${formatMoney(blockedTotal)} bloqueado`}</b>
                <span>{blockedList[0]?.blockReason ? `Em análise: ${blockedList[0].blockReason}` : 'Em análise pela DROP'}</span>
              </span>
            </li>
          )}
        </ul>
      )}

      {(week || weekFailed) && <WeekBlock week={week} bars={weekOk ? weekBars(payouts, now) : null} onRetry={retry} />}

      <Tabs
        label="Ganhos"
        idPrefix="ganhos"
        value={seg}
        onChange={(id) => onSeg(id as GanhosSeg)}
        items={[
          { id: 'corridas', label: 'Corridas' },
          { id: 'saques', label: 'Saques' },
          { id: 'notas', label: 'Notas fiscais', count: invoices?.length },
        ]}
      />
      <div {...tabPanelProps(seg, 'ganhos')}>
        {seg === 'corridas' && (
          <RideList money={money} failed={payoutsFailed} onRetry={retryRides} onOpen={(id) => router.push(MOTOBOY_ROUTES.entrega(id))} />
        )}
        {seg === 'saques' && <WithdrawalList withdrawals={withdrawals} onRetry={retry} />}
        {seg === 'notas' && <InvoiceList invoices={invoices} onRetry={retry} onOpen={(id) => router.push(`/invoice/${id}`)} />}
      </div>

      <WithdrawPixSheet
        open={sheet}
        onClose={() => setSheet(false)}
        available={available}
        minimum={minimum}
        pixLabel={pix?.key ?? null}
        onChangeKey={() => router.push(MOTOBOY_ROUTES.recebimento)}
        outside={{ pending, blocked: showBlocked ? blockedTotal : 0 }}
        blocked={uncertain ? UNCERTAIN_TEXT : null}
        error={sheetError}
        submitting={submitting}
        instant={rules ? rules.autoApproveWithdrawals : null}
        onConfirm={confirm}
      />
    </div>
  );
}

/** Total e contagem do servidor (K35); barras e "melhor dia" só com a janela inteira. */
function WeekBlock({ week, bars, onRetry }: { week: Week | null; bars: WeekBars | null; onRetry: () => void }) {
  const max = bars ? Math.max(...bars.days.map((d) => d.total)) : 0;
  return (
    <section className={blocks.blk} aria-label="Esta semana">
      <div className={blocks.head}>
        <h2 className={blocks.headTitle}>Esta semana</h2>
        {week && <b className={styles.price}>{formatMoney(week.earnings)}</b>}
      </div>
      {!week ? (
        <p className={blocks.errText}>
          Não carregamos o resumo da semana.{' '}
          <button type="button" className={blocks.link} onClick={onRetry}>Tentar de novo</button>
        </p>
      ) : (
        <>
          {bars && (
            <>
              <div className={styles.bars} aria-hidden="true">
                {bars.days.map((d) => (
                  <i key={d.label} className={d.best ? styles.barOn : styles.bar} style={{ height: `${max > 0 ? Math.max(4, Math.round((d.total / max) * 100)) : 4}%` }} />
                ))}
              </div>
              <div className={styles.barsX} aria-hidden="true">{bars.days.map((d) => <span key={d.label}>{d.label}</span>)}</div>
            </>
          )}
          <span className={blocks.meta}>
            {week.count === 0
              ? 'Nenhuma corrida esta semana ainda.'
              : `${week.count} ${week.count === 1 ? 'corrida' : 'corridas'}${bars?.bestDay ? ` · melhor dia: ${bars.bestDay}` : ''}`}
          </span>
        </>
      )}
    </section>
  );
}

interface RideRow { key: string; deliveryId: string | null; orderId: string | null; createdAt: string | null; money: MoneyInfo | null }

/**
 * Uma linha por corrida (repasse dividido por saque soma numa só). Valor e selo vêm de
 * money.moneyOf: se a leitura parou no teto de páginas (coveredFrom), a linha fica sem valor —
 * o createdAt da entrega não está aqui, então moneyOf devolve null (nunca uma parte como o todo).
 */
function rideRows(index: MotoboyMoney['index'], moneyOf: MotoboyMoney['moneyOf']): RideRow[] {
  const rows: RideRow[] = [];
  const first = (parts: MoneyInfo[]) => parts.reduce<string | null>((a, p) => (p.createdAt && (!a || ms(p.createdAt) < ms(a)) ? p.createdAt : a), null);
  index.byDelivery.forEach((parts, deliveryId) => {
    rows.push({ key: `d:${deliveryId}`, deliveryId, orderId: parts[0]?.orderId ?? null, createdAt: first(parts), money: moneyOf({ _id: deliveryId }) });
  });
  index.byOrder.forEach((parts, orderId) => {
    rows.push({ key: `o:${orderId}`, deliveryId: null, orderId, createdAt: first(parts), money: moneyOf({ orderId }) });
  });
  return rows.sort((a, b) => (ms(b.createdAt) || 0) - (ms(a.createdAt) || 0));
}

function RideList({ money, failed, onRetry, onOpen }: { money: MotoboyMoney; failed: boolean; onRetry: () => void; onOpen: (deliveryId: string) => void }) {
  const { index, moneyOf } = money;
  const rows = useMemo(() => rideRows(index, moneyOf), [index, moneyOf]);
  // K29: leitura com erro nunca vira o vazio "Suas corridas aparecem aqui…".
  if (failed || money.status === 'error') {
    return (
      <p className={blocks.errText}>
        Não carregamos suas corridas.{' '}
        <button type="button" className={blocks.link} onClick={onRetry}>Tentar de novo</button>
      </p>
    );
  }
  if (money.status === 'loading') return <div className={styles.stack} aria-busy="true"><Skeleton height={64} /><Skeleton height={64} /></div>;
  if (rows.length === 0) return <p className={blocks.meta}>Suas corridas aparecem aqui depois da primeira entrega.</p>;
  return (
    <ul className={blocks.list}>
      {rows.map((r) => {
        const badge = r.money ? moneyBadge(r.money) : null;
        const inner = (
          <>
            <span className={blocks.tx}><b>{`Entrega #${shortOrderCode(r.orderId || '')}`}</b><span>{formatDateTime(r.createdAt) ?? '—'}</span></span>
            {r.money && badge && (
              <span className={blocks.end}><b className={styles.price}>{formatMoney(r.money.amount)}</b><span className={moneyTagClass(badge.tone)}>{badge.label}</span></span>
            )}
          </>
        );
        return (
          <li key={r.key}>
            {r.deliveryId ? (
              <button type="button" className={[blocks.row, blocks.rowButton].join(' ')} onClick={() => onOpen(r.deliveryId as string)}>{inner}</button>
            ) : (
              <div className={blocks.row}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function WithdrawalList({ withdrawals, onRetry }: { withdrawals: any[] | null; onRetry: () => void }) {
  if (withdrawals === null) {
    return (
      <p className={blocks.errText}>
        Não carregamos seus saques.{' '}
        <button type="button" className={blocks.link} onClick={onRetry}>Tentar de novo</button>
      </p>
    );
  }
  if (withdrawals.length === 0) return <p className={blocks.meta}>Seus saques aparecem aqui.</p>;
  return (
    <ul className={blocks.list}>
      {withdrawals.map((w, i) => {
        const v = withdrawalView(w);
        return (
          <li key={String(w._id || w.id || i)} className={blocks.row}>
            <span className={blocks.tx}>
              <b>Saque Pix</b>
              <span>{formatDateTime(w.requestedAt || w.createdAt) ?? '—'}</span>
              {w.status === 'rejected' && w.rejectionReason && <span className={styles.note}>{`Motivo: ${w.rejectionReason}`}</span>}
            </span>
            <span className={blocks.end}>
              <b className={[styles.price, styles.debit].join(' ')}>{`−${formatMoney(Number(w.amount) || 0)}`}</b>
              <span className={stageTagClass(v.tone)}>{v.label}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function InvoiceList({ invoices, onRetry, onOpen }: { invoices: any[] | null; onRetry: () => void; onOpen: (id: string) => void }) {
  if (invoices === null) {
    return (
      <p className={blocks.errText}>
        Não carregamos suas notas.{' '}
        <button type="button" className={blocks.link} onClick={onRetry}>Tentar de novo</button>
      </p>
    );
  }
  if (invoices.length === 0) return <p className={blocks.meta}>As notas fiscais das suas corridas aparecem aqui.</p>;
  return (
    <ul className={blocks.list}>
      {invoices.map((inv) => {
        const amount = Number(inv.motoboyAmount);
        return (
          <li key={String(inv.id)}>
            <button type="button" className={[blocks.row, blocks.rowButton].join(' ')} onClick={() => onOpen(String(inv.id))}>
              <span className={blocks.tx}>
                <b>{`NFS-e ${inv.invoiceNumber}`}</b>
                <span>{`#${shortOrderCode(inv.orderId || '')} · ${formatDateTime(inv.issuedAt) ?? '—'}`}</span>
              </span>
              {Number.isFinite(amount) && <b className={styles.price}>{formatMoney(amount)}</b>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default CustodyEarnings;
