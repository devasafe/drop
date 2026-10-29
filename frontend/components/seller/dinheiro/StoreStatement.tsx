// frontend/components/seller/dinheiro/StoreStatement.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import api from '../../../lib/api';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { Skeleton } from '../../ui/Skeleton';
import { SellerWithdrawSheet } from './SellerWithdrawSheet';
import { formatMoney } from '../../../lib/money';
import { SELLER_ROUTES } from '../../../lib/sellerRoutes';
import { apiError, unwrap } from '../../../lib/sellerApi';
import styles from './StoreStatement.module.css';

export type StatementKind = 'sale' | 'fee' | 'motoboy' | 'withdrawal' | 'refund' | 'pix' | 'other';

export interface StatementItem {
  id: string;
  date: string;
  /** Servidor antigo não manda: a linha cai em "Outros" com o `label` como título. */
  kind?: StatementKind;
  title?: string;
  label: string;
  orderId: string | null;
  orderCode?: string | null;
  value: number;
  balance: number;
}

export interface Statement {
  balance: number;
  reserved: { motoboys: number; refunds: number; withdrawals?: number; total: number };
  available: number;
  withdrawTo: string | null;
  items: StatementItem[];
  hasMore: boolean;
  days: number;
}

const PERIODS = [7, 30, 90] as const;

/** Filtros por tipo, na ordem da tela. "Outros" junta Pix sem dono e o resto. */
const KINDS: Array<{ id: string; label: string; kinds: StatementKind[] }> = [
  { id: 'sale', label: 'Vendas', kinds: ['sale'] },
  { id: 'fee', label: 'Taxas', kinds: ['fee'] },
  { id: 'motoboy', label: 'Motoboy', kinds: ['motoboy'] },
  { id: 'withdrawal', label: 'Saques', kinds: ['withdrawal'] },
  { id: 'refund', label: 'Estornos', kinds: ['refund'] },
  { id: 'other', label: 'Outros', kinds: ['pix', 'other'] },
];

type View = 'day' | 'order';
type Sort = 'desc' | 'asc';

const kindOf = (it: StatementItem): StatementKind => it.kind ?? 'other';
const titleOf = (it: StatementItem): string => it.title ?? it.label;
const codeOf = (it: { orderId: string | null; orderCode?: string | null }) =>
  it.orderCode ?? (it.orderId ? it.orderId.slice(-6).toUpperCase() : '');
const signed = (v: number) => `${v < 0 ? '−' : '+'} ${formatMoney(Math.abs(v))}`;
const sum = (items: StatementItem[]) => items.reduce((t, i) => t + Math.round(i.value * 100), 0) / 100;

/** "fretes de motoboy, estornos e um saque a caminho": o que compõe o valor guardado. */
function reservedText(r: Statement['reserved']): string {
  const parts = [
    r.motoboys > 0 && 'fretes de motoboy',
    r.refunds > 0 && 'estornos a clientes',
    (r.withdrawals ?? 0) > 0 && 'um saque a caminho',
  ].filter(Boolean) as string[];
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0] ?? 'pagamentos';
  return `${formatMoney(r.total)} ficam guardados para ${list} que ainda vão sair.`;
}

/** "2026-10-28" → "28 de out." (data civil, sem fuso). */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

/** Erro do servidor em frase para o lojista (a chave sem permissão de extrato é o caso comum). */
function loadErrorText(err: unknown): string {
  const e = apiError(err);
  if (e.code === 'STORE_PAYMENTS_NOT_READY') return 'Sua conta de recebimento não está conectada.';
  return e.message && /permiss/i.test(e.message)
    ? 'A chave de API da sua conta de recebimento não deixa a DROP ler o extrato. Libere a permissão de Extrato.'
    : 'Não carregamos o extrato. Confira a conexão.';
}

/**
 * Saldo, saque e extrato da conta de recebimento da loja (modo direto), na língua da DROP.
 * O saque vai só para a chave Pix no CPF/CNPJ do dono da conta e pede a senha.
 */
export function StoreStatement({ storeId, minimum }: { storeId: string; minimum: number | null }) {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Statement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Cada carga da 1ª página invalida as respostas em voo (troca de período).
  const gen = useRef(0);

  useEffect(() => {
    const g = ++gen.current;
    setError(null);
    setMoreError(null);
    api.get(`/stores/${storeId}/asaas/extrato?days=${days}`)
      .then((r) => { if (g === gen.current) setData(unwrap<Statement>(r)); })
      .catch((err) => { if (g === gen.current) { setData(null); setError(loadErrorText(err)); } });
  }, [storeId, days, attempt]);

  const loadMore = useCallback(async () => {
    if (!data || loadingMore) return;
    const g = gen.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const r = await api.get(`/stores/${storeId}/asaas/extrato?days=${days}&offset=${data.items.length}`);
      const next = unwrap<Statement>(r);
      if (g !== gen.current || !next) return;
      setData((prev) => prev && {
        ...prev,
        items: [...prev.items, ...next.items.filter((i) => !prev.items.some((p) => p.id === i.id))],
        hasMore: next.hasMore,
      });
    } catch {
      if (g === gen.current) setMoreError('Não deu para carregar mais. Tente de novo.');
    } finally {
      setLoadingMore(false);
    }
  }, [data, days, loadingMore, storeId]);

  const withdraw = async (amount: number | 'all', password?: string) => {
    if (!data) return;
    setBusy(true);
    setSheetError(null);
    const value = amount === 'all' ? data.available : amount;
    try {
      const r = await api.post(`/stores/${storeId}/asaas/saque`, { amount: value, password });
      const res = unwrap<{ uncertain?: boolean }>(r);
      setOpen(false);
      setDone(res?.uncertain
        ? `Saque de ${formatMoney(value)} em conferência. Avisamos quando cair.`
        : `Saque de ${formatMoney(value)} a caminho do seu Pix.`);
      setAttempt((n) => n + 1);
    } catch (err) {
      setSheetError(apiError(err).message || 'Não deu para sacar agora. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <Alert tone="error" title="Saldo e extrato" action={{ label: 'Tentar de novo', onClick: () => setAttempt((n) => n + 1) }}>
        {error}
      </Alert>
    );
  }
  if (!data) return <div role="status" aria-label="Carregando saldo"><Skeleton height={160} /></div>;

  const canWithdraw = !!data.withdrawTo && data.available > 0;

  return (
    <>
      <section className={styles.balance} aria-label="Saldo">
        <span className={styles.balanceLabel}>Saldo na sua conta</span>
        <b className={styles.balanceValue}>{formatMoney(data.balance)}</b>
        <span className={styles.balanceMeta}>{`Disponível para sacar: ${formatMoney(data.available)}`}</span>
        {data.reserved.total > 0 && (
          <span className={styles.balanceMeta}>{reservedText(data.reserved)}</span>
        )}
        <Button onClick={() => { setSheetError(null); setDone(null); setOpen(true); }} disabled={!canWithdraw}>
          Sacar para meu Pix
        </Button>
        {!data.withdrawTo && (
          <span className={styles.balanceMeta}>Não achamos o CPF ou CNPJ da sua conta de recebimento para o saque.</span>
        )}
      </section>
      {done && <p role="status" className={styles.notice}>{done}</p>}

      <section className={styles.statement} aria-label="Extrato">
        <div className={styles.head}>
          <h2 className={styles.title}>Extrato</h2>
          <div className={styles.periods} role="group" aria-label="Período">
            {PERIODS.map((d) => (
              <button
                key={d}
                type="button"
                className={styles.period}
                aria-pressed={days === d}
                onClick={() => { if (d !== days) { setData(null); setDays(d); } }}
              >
                {`${d} dias`}
              </button>
            ))}
          </div>
        </div>

        {data.items.length === 0 ? (
          <p className={styles.empty}>{`Nenhuma movimentação nos últimos ${data.days} dias.`}</p>
        ) : (
          <StatementList items={data.items} />
        )}
        {moreError && <p role="alert" className={styles.err}>{moreError}</p>}
        {data.hasMore && (
          <Button variant="tertiary" onClick={loadMore} loading={loadingMore}>Carregar mais</Button>
        )}
      </section>

      <SellerWithdrawSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Sacar para meu Pix"
        available={data.available}
        minimum={minimum}
        pixLabel={data.withdrawTo}
        note="O saque vai só para a chave Pix no CPF ou CNPJ do dono da conta."
        askPassword
        error={sheetError}
        submitting={busy}
        onConfirm={withdraw}
      />
    </>
  );
}

function Row({ it, showBalance, showOrder }: { it: StatementItem; showBalance: boolean; showOrder: boolean }) {
  return (
    <li className={styles.row}>
      <span className={styles.rowLabel}>{titleOf(it)}</span>
      <span className={it.value < 0 ? styles.out : styles.in}>{signed(it.value)}</span>
      {showOrder && it.orderId
        ? <Link className={styles.orderLink} href={SELLER_ROUTES.pedido(it.orderId)}>{`Pedido #${codeOf(it)}`}</Link>
        : <span />}
      {showBalance && <span className={styles.after}>{`Saldo ${formatMoney(it.balance)}`}</span>}
    </li>
  );
}

/** Linhas do extrato com filtro por tipo, ordem e visão por dia ou por pedido. */
function StatementList({ items }: { items: StatementItem[] }) {
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState<View>('day');
  const [sort, setSort] = useState<Sort>('desc');

  const present = KINDS.filter((k) => items.some((i) => k.kinds.includes(kindOf(i))));
  const active = KINDS.find((k) => k.id === filter);
  const shown = active ? items.filter((i) => active.kinds.includes(kindOf(i))) : items;
  // O servidor manda do mais recente ao mais antigo.
  const ordered = sort === 'desc' ? shown : [...shown].reverse();
  const totalIn = sum(shown.filter((i) => i.value > 0));
  const totalOut = sum(shown.filter((i) => i.value < 0));

  const days: Array<{ date: string; items: StatementItem[] }> = [];
  for (const it of ordered) {
    const last = days[days.length - 1];
    if (last && last.date === it.date) last.items.push(it);
    else days.push({ date: it.date, items: [it] });
  }

  const orders: Array<{ key: string; head: StatementItem; items: StatementItem[] }> = [];
  for (const it of ordered) {
    const key = it.orderId ?? '';
    const g = orders.find((o) => o.key === key);
    if (g) g.items.push(it);
    else orders.push({ key, head: it, items: [it] });
  }
  // "Sem pedido" vai por último.
  orders.sort((x, y) => Number(!x.key) - Number(!y.key));

  return (
    <>
      <div className={styles.filters}>
        {present.length > 1 && (
          <div className={styles.chips} role="group" aria-label="Tipo">
            <Chip label="Tudo" active={filter === 'all'} onClick={() => setFilter('all')} />
            {present.map((k) => (
              <Chip key={k.id} label={k.label} active={filter === k.id} onClick={() => setFilter(k.id)} />
            ))}
          </div>
        )}
        <div className={styles.controls}>
          <div className={styles.periods} role="group" aria-label="Ver">
            <button type="button" className={styles.period} aria-pressed={view === 'day'} onClick={() => setView('day')}>Por dia</button>
            <button type="button" className={styles.period} aria-pressed={view === 'order'} onClick={() => setView('order')}>Por pedido</button>
          </div>
          <button type="button" className={styles.period} onClick={() => setSort(sort === 'desc' ? 'asc' : 'desc')}>
            {sort === 'desc' ? 'Mais recentes primeiro' : 'Mais antigos primeiro'}
          </button>
        </div>
      </div>

      <p className={styles.summary}>
        <span>Entrou <b className={styles.in}>{formatMoney(totalIn)}</b></span>
        <span>Saiu <b className={styles.out}>{formatMoney(Math.abs(totalOut))}</b></span>
      </p>

      {shown.length === 0 ? (
        <p className={styles.empty}>Nada desse tipo no período.</p>
      ) : view === 'day' ? (
        days.map((g) => (
          <div key={g.date} className={styles.day}>
            <h3 className={styles.dayLabel}>{dayLabel(g.date)}</h3>
            <ul className={styles.list}>
              {g.items.map((it) => <Row key={it.id} it={it} showBalance showOrder />)}
            </ul>
          </div>
        ))
      ) : (
        orders.map((g) => {
          const net = sum(g.items);
          return (
            <div key={g.key || 'none'} className={styles.orderGroup}>
              <div className={styles.orderHead}>
                <h3 className={styles.orderTitle}>
                  {g.head.orderId
                    ? <Link href={SELLER_ROUTES.pedido(g.head.orderId)}>{`Pedido #${codeOf(g.head)}`}</Link>
                    : 'Sem pedido'}
                </h3>
                <span className={styles.orderMeta}>{dayLabel(g.head.date)}</span>
                <span className={net < 0 ? styles.out : styles.in}>{`${g.head.orderId ? 'Ficou ' : ''}${signed(net)}`}</span>
              </div>
              <ul className={styles.list}>
                {g.items.map((it) => <Row key={it.id} it={it} showBalance={false} showOrder={false} />)}
              </ul>
            </div>
          );
        })
      )}
    </>
  );
}
