// frontend/components/motoboy/ganhos/DirectEarnings.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Receipt, TriangleAlert } from 'lucide-react';
import api from '../../../lib/api';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import LegacyBalanceCard from '../../wallet/LegacyBalanceCard';
import { WithdrawPixSheet } from './WithdrawPixSheet';
import { PixAtrasadoSheet } from './PixAtrasadoSheet';
import { moneyTagClass } from '../moneyTag';
import { useMotoboyRules } from '../../../hooks/useMotoboyRules';
import { useSocket } from '../../../contexts/SocketContext';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';
import { isLateTransfer, isToday, moneyBadge, transferToMoney, windowCovered, type MoneyInfo } from '../../../lib/motoboyMoney';
import { formatMoney } from '../../../lib/money';
import { shortOrderCode } from '../../../lib/customerOrder';
import { apiError, formatDateTime } from '../../../lib/sellerApi';
import { weekFromResponse, type Week } from './weekSummary';
import blocks from '../../panel/PanelBlocks.module.css';
import styles from './Ganhos.module.css';

const sumCents = (list: MoneyInfo[]) => list.reduce((s, m) => s + Math.round(m.amount * 100), 0) / 100;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const lateText = (n: number) => `${n} Pix ${n === 1 ? 'atrasado' : 'atrasados'}`;
const toMoneyList = (raw: any): MoneyInfo[] => (Array.isArray(raw) ? raw : []).map(transferToMoney).filter(Boolean) as MoneyInfo[];
const nextCursorOf = (d: any): string | null => (typeof d?.nextCursor === 'string' && d.nextCursor ? d.nextCursor : null);
const ms = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0);

/** Saldo do modo anterior: null = carregando; 'error' = a leitura falhou (K29: nunca 0, nunca some calado). */
type Legacy = number | null | 'error';

/**
 * Ganhos no modo direto (protótipos "Repasses recebidos", "Pix atrasado" e "Ganhos · saldo do modo
 * anterior"). Cada loja paga o motoboy por Pix: não há saldo nem saque, só o que sobrou da custódia.
 * - "Recebido hoje" soma só os Pix que caíram (done), e só com a janela de hoje inteira.
 * - "Esta semana" vem só de GET /deliveries/summary (K35); "A caminho" só com a lista inteira.
 * - Rótulo e tom de cada Pix vêm de transferView (K30), via moneyBadge e isLateTransfer.
 * - Sem saldo antigo (hasLeftover=false) não sai chamada a /wallets, /payouts nem /withdrawals.
 * Cada linha já é o Pix da própria corrida (GET /motoboy/transfers): não há lista de entregas para
 * casar com useMotoboyMoney aqui.
 */
export function DirectEarnings({ hasLeftover, now = new Date() }: { hasLeftover: boolean; now?: Date }) {
  const router = useRouter();
  const { onReconnect } = useSocket();
  const { rules } = useMotoboyRules();
  const [items, setItems] = useState<MoneyInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  // Geração da consulta: recarregar invalida um "Carregar mais" em voo (regra da carteira antiga).
  const gen = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [week, setWeek] = useState<Week | null>(null);
  const [weekFailed, setWeekFailed] = useState(false);
  const [weekAttempt, setWeekAttempt] = useState(0);
  const [pix, setPix] = useState<string | null>(null);
  const [late, setLate] = useState<MoneyInfo | null>(null);
  const [legacy, setLegacy] = useState<Legacy>(null);
  const [legacyAttempt, setLegacyAttempt] = useState(0);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [legacyBusy, setLegacyBusy] = useState(false);
  const [legacyError, setLegacyError] = useState<string | null>(null);
  const [legacyMin, setLegacyMin] = useState<number | null>(null);
  const [legacyDone, setLegacyDone] = useState<string | null>(null);

  useEffect(() => {
    const my = ++gen.current;
    setFailed(false);
    setMoreError(false);
    Promise.resolve()
      .then(() => api.get('/motoboy/transfers'))
      .then((r: any) => {
        if (my !== gen.current) return;
        setItems(toMoneyList(r?.data?.data));
        setCursor(nextCursorOf(r?.data));
      })
      .catch(() => {
        if (my !== gen.current) return;
        // K29: erro nunca vira a lista vazia ("Nenhum Pix ainda").
        setItems(null);
        setCursor(null);
        setFailed(true);
      });
    let off = false;
    Promise.resolve()
      .then(() => api.get('/onboarding/status'))
      .then((r: any) => { if (!off) setPix(typeof r?.data?.pixKey === 'string' && r.data.pixKey ? r.data.pixKey : null); })
      .catch(() => { if (!off) setPix(null); });
    return () => { off = true; };
  }, [attempt]);

  useEffect(() => () => { gen.current += 1; }, []);

  // K35: "Esta semana" só do servidor. Erro → erro com Tentar de novo, nunca a soma da lista.
  useEffect(() => {
    let off = false;
    setWeekFailed(false);
    Promise.resolve()
      .then(() => api.get('/deliveries/summary'))
      .then((r: any) => {
        if (off) return;
        const w = weekFromResponse(r);
        setWeek(w);
        setWeekFailed(!w);
      })
      .catch(() => {
        if (off) return;
        setWeek(null);
        setWeekFailed(true);
      });
    return () => { off = true; };
  }, [weekAttempt]);

  // Saldo do modo anterior: o agregado do servidor de TODOS os `released` (GET /payouts/my/summary →
  // available). Nunca a soma de uma página da lista: o saque vai como 'all' e o servidor saca tudo,
  // então o valor mostrado em "Sacar R$ X" tem de ser o total real.
  useEffect(() => {
    if (!hasLeftover) { setLegacy(null); return undefined; }
    let off = false;
    setLegacy(null);
    Promise.resolve()
      .then(() => api.get('/payouts/my/summary'))
      .then((r: any) => {
        if (off) return;
        const raw = r?.data?.available;
        const v = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
        // Formato estranho conta como erro (K29), nunca vira R$ 0,00.
        setLegacy(Number.isFinite(v) ? Math.round(v * 100) / 100 : 'error');
      })
      // K29: fail closed. Nunca 0 (o card sumiria calado) nem custódia presumida: erro com retry.
      .catch(() => { if (!off) setLegacy('error'); });
    return () => { off = true; };
  }, [hasLeftover, legacyAttempt]);

  const reload = useCallback(() => {
    setAttempt((n) => n + 1);
    setWeekAttempt((n) => n + 1);
    setLegacyAttempt((n) => n + 1);
  }, []);
  useEffect(() => onReconnect(reload), [onReconnect, reload]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    const my = gen.current;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const r: any = await api.get('/motoboy/transfers', { params: { cursor } });
      if (my !== gen.current) return; // lista relida: resposta da lista antiga
      const more = toMoneyList(r?.data?.data);
      setItems((prev) => {
        const base = prev ?? [];
        return [...base, ...more.filter((m) => !base.some((p) => p.id === m.id))];
      });
      setCursor(nextCursorOf(r?.data));
    } catch {
      if (my === gen.current) setMoreError(true);
    } finally {
      if (my === gen.current) setLoadingMore(false);
    }
  };
  // Lista relida no meio de um "Carregar mais": o botão volta a ficar livre.
  useEffect(() => { setLoadingMore(false); }, [attempt]);

  const legacyAmount = typeof legacy === 'number' ? legacy : 0;

  const withdrawLegacy = async (amount: number | 'all') => {
    if (legacyAmount <= 0) return;
    setLegacyBusy(true);
    setLegacyError(null);
    try {
      const r: any = await api.post('/withdrawals/request', { amount });
      const v = Number(r?.data?.withdrawal?.amount);
      // Só depois do sucesso: fecha a sheet e então relê o saldo (com ela aberta, o valor novo zeraria o campo).
      setLegacyOpen(false);
      setLegacyDone(Number.isFinite(v) && v > 0 ? `Saque de ${formatMoney(v)} a caminho da sua chave Pix.` : 'Saque a caminho da sua chave Pix.');
      setLegacyAttempt((n) => n + 1);
    } catch (err) {
      // 400 BELOW_MINIMUM_WITHDRAW traz o mínimo atual do servidor: passa a valer na sheet.
      const m = Number((err as any)?.response?.data?.minimum);
      if (Number.isFinite(m) && m > 0) setLegacyMin(m);
      setLegacyError(apiError(err).message || 'Não deu para pedir o saque agora.');
    } finally {
      // Volta a false em todo envio: é isso que destrava o envio único da sheet.
      setLegacyBusy(false);
    }
  };

  const sorted = [...(items ?? [])].sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  const hasMore = cursor !== null;
  const todayOk = windowCovered(sorted.map((m) => m.createdAt), hasMore, (iso) => isToday(iso, now));
  const today = sorted.filter((m) => m.status === 'done' && isToday(m.createdAt, now));
  const onTheWay = sorted.filter((m) => m.status !== 'done');
  const lateList = sorted.filter(isLateTransfer);

  return (
    <div className={styles.stack}>
      {hasLeftover && (
        legacy === 'error' ? (
          <section className={blocks.blk} aria-label="Saldo do modo anterior">
            <span className={blocks.meta}>Não carregamos o saldo do modo anterior</span>
            <p className={blocks.errText}>
              Confira a conexão.{' '}
              <button type="button" className={blocks.link} onClick={() => setLegacyAttempt((n) => n + 1)}>Tentar de novo</button>
            </p>
          </section>
        ) : legacy === null ? (
          <div aria-busy="true"><Skeleton height={120} /></div>
        ) : (
          <LegacyBalanceCard amount={legacy} onWithdraw={() => { setLegacyError(null); setLegacyOpen(true); }} />
        )
      )}
      {legacyDone && <p role="status" className={blocks.meta}>{legacyDone}</p>}

      {items === null ? (
        failed ? (
          <EmptyState variant="error" icon={<TriangleAlert size={28} aria-hidden="true" />} title="Não carregamos seus repasses" description="Confira a conexão." onRetry={() => setAttempt((n) => n + 1)} />
        ) : (
          <div role="status" aria-label="Carregando" className={styles.stack}><Skeleton height={120} /><Skeleton height={96} /></div>
        )
      ) : (
        <>
          {todayOk && (
            <section className={[blocks.blk, blocks.blkBrand].join(' ')} aria-label="Recebido hoje">
              <span className={blocks.meta}>Recebido hoje</span>
              <b className={blocks.big}>{formatMoney(sumCents(today))}</b>
              <span className={blocks.sub}>{`${plural(today.length, 'entrega', 'entregas')}${pix ? ` · direto na sua chave ${pix}` : ''}`}</span>
            </section>
          )}
          {(week || weekFailed || !hasMore) && (
            <section className={blocks.kpis} aria-label="Resumo dos repasses">
              {week && (
                <div className={blocks.kpi}><small>Esta semana</small><b>{formatMoney(week.earnings)}</b><em>{plural(week.count, 'entrega', 'entregas')}</em></div>
              )}
              {!week && weekFailed && (
                <div className={blocks.kpi}>
                  <small>Esta semana</small>
                  <p className={blocks.errText}>
                    Não carregamos o resumo da semana.{' '}
                    <button type="button" className={blocks.link} onClick={() => setWeekAttempt((n) => n + 1)}>Tentar de novo</button>
                  </p>
                </div>
              )}
              {!hasMore && (
                <div className={blocks.kpi}>
                  <small>A caminho</small>
                  <b>{formatMoney(sumCents(onTheWay))}</b>
                  <em className={lateList.length > 0 ? blocks.warn : undefined}>{lateList.length > 0 ? lateText(lateList.length) : 'nenhum atrasado'}</em>
                </div>
              )}
            </section>
          )}
          {lateList.length > 0 && (
            <Alert tone="warning" title={lateText(lateList.length)} action={{ label: 'Ver detalhes', onClick: () => setLate(lateList[0]) }}>
              Quem envia o Pix é a loja. Você não precisa fazer nada: veja em que pé está.
            </Alert>
          )}

          <div className={blocks.head}><h2 className={blocks.headTitle}>Pix recebidos</h2></div>
          {sorted.length === 0 ? (
            <EmptyState icon={<Receipt size={28} aria-hidden="true" />} title="Nenhum Pix ainda" description="Os Pix que as lojas enviarem pelas suas entregas aparecem aqui." />
          ) : (
            <ul className={blocks.list}>
              {sorted.map((m) => {
                const badge = moneyBadge(m);
                const inner = (
                  <>
                    <span className={blocks.tx}><b>{`Entrega #${shortOrderCode(m.orderId || '')}`}</b><span>{formatDateTime(m.createdAt) ?? '—'}</span></span>
                    <span className={blocks.end}><b className={styles.price}>{formatMoney(m.amount)}</b><span className={moneyTagClass(badge.tone)}>{badge.label}</span></span>
                  </>
                );
                return (
                  <li key={m.id}>
                    {m.status !== 'done' ? (
                      <button type="button" className={[blocks.row, blocks.rowButton].join(' ')} onClick={() => setLate(m)}>{inner}</button>
                    ) : (
                      <div className={blocks.row}>{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {cursor && (
            <div className={styles.more}>
              <Button variant="tertiary" loading={loadingMore} onClick={loadMore}>Carregar mais</Button>
            </div>
          )}
          {moreError && <p role="alert" className={blocks.errText}>Não foi possível carregar mais pagamentos.</p>}
        </>
      )}

      <PixAtrasadoSheet
        transfer={late}
        blockHours={rules?.transferBlockHours ?? null}
        onClose={() => setLate(null)}
        onSupport={() => router.push(MOTOBOY_ROUTES.perfilAjuda)}
      />
      {hasLeftover && (
        <WithdrawPixSheet
          open={legacyOpen && legacyAmount > 0}
          onClose={() => setLegacyOpen(false)}
          title="Sacar saldo do modo anterior"
          available={legacyAmount}
          minimum={legacyMin ?? rules?.minimumWithdraw ?? null}
          pixLabel={pix}
          onChangeKey={() => router.push(MOTOBOY_ROUTES.recebimento)}
          outside={null}
          error={legacyError}
          submitting={legacyBusy}
          instant={rules ? rules.autoApproveWithdrawals : null}
          onConfirm={withdrawLegacy}
        />
      )}
    </div>
  );
}

export default DirectEarnings;
