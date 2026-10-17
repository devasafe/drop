/**
 * Dinheiro · Visão geral (D3b-3, spec 7; protótipo "Dinheiro"). Permissão money:overview (padrão só CEO).
 * GET /admin/money/summary → cartões por modo e "Para onde foi o dinheiro hoje";
 * GET /admin/money/movements?type=&cursor= → "Movimentos de hoje" (50 por página, "Carregar mais").
 * Cada bloco carrega e falha sozinho (fail closed: erro com "Tentar de novo", nunca zero).
 * O cartão só leva à aba que o papel vê no modo do resumo. Pedido abre /order/{id} (nunca /admin/order).
 */
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { AdminTable, type AdminColumn } from '../../components/admin/AdminTable';
import { Kpi } from '../../components/admin/Kpi';
import blocks from '../../components/admin/AdminBlocks.module.css';
import { EmptyNote, LoadError, LoadSkeleton } from '../../components/admin/LoadState';
import { StatusTag } from '../../components/admin/StatusTag';
import ui from '../../components/admin/dinheiro/Dinheiro.module.css';
import { serverErrorMessage } from '../../components/admin/dinheiro/serverError';
import { Button } from '../../components/ui/Button';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Select } from '../../components/ui/Select';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import { visibleAdminAreas } from '../../lib/adminNav';
import {
  MONEY_MOVEMENT_TYPES, MOVEMENT_TONE, MOVEMENT_TYPE_LABEL, isMoneySummary, plural, shortId, spTime,
  type MoneyFlow, type MoneyMovement, type MoneyMovementPage, type MoneySummary,
} from '../../lib/adminMoney';
import { formatMoney } from '../../lib/money';

const TYPE_OPTIONS = [
  { value: '', label: 'Todos os tipos' },
  ...MONEY_MOVEMENT_TYPES.map((t) => ({ value: t, label: MOVEMENT_TYPE_LABEL[t] })),
];

const isPage = (d: unknown): d is MoneyMovementPage => !!d && Array.isArray((d as MoneyMovementPage).items);

export default function AdminDinheiroPage() {
  return (
    <ProtectedRoute required_permission="money:overview">
      <AdminShell title="Dinheiro · Visão geral" tabs="dinheiro">
        <VisaoGeral />
      </AdminShell>
    </ProtectedRoute>
  );
}

function VisaoGeral() {
  const { user, can } = useAuth();
  const isCeo = (user?.activeRole || user?.role) === 'ceo';

  const [summary, setSummary] = useState<MoneySummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [type, setType] = useState('');
  const [items, setItems] = useState<MoneyMovement[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Só a última leitura vale: trocar o filtro descarta a resposta da anterior.
  const listReq = useRef(0);
  // Trava síncrona contra clique duplo em "Carregar mais".
  const moreInFlight = useRef(false);

  const loadSummary = useCallback(async () => {
    setSummaryError(null);
    setSummary(null);
    try {
      const res = await api.get('/admin/money/summary');
      if (!isMoneySummary(res.data)) throw new Error('resumo fora do formato');
      setSummary(res.data);
    } catch (err) {
      setSummaryError(serverErrorMessage(err, 'Não deu para carregar o resumo do dinheiro.'));
    }
  }, []);

  const loadMovements = useCallback(async () => {
    const id = ++listReq.current;
    moreInFlight.current = false;
    setItems(null);
    setCursor(null);
    setListError(null);
    setMoreError(null);
    setLoadingMore(false);
    try {
      const res = await api.get(`/admin/money/movements${type ? `?type=${type}` : ''}`);
      if (id !== listReq.current) return;
      if (!isPage(res.data)) throw new Error('lista fora do formato');
      setItems(res.data.items);
      setCursor(res.data.nextCursor ?? null);
    } catch (err) {
      if (id !== listReq.current) return;
      setListError(serverErrorMessage(err, 'Não deu para carregar os movimentos de hoje.'));
    }
  }, [type]);

  const loadMore = async () => {
    if (!cursor || moreInFlight.current) return;
    moreInFlight.current = true;
    const id = listReq.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      params.set('cursor', cursor);
      const res = await api.get(`/admin/money/movements?${params}`);
      if (id !== listReq.current) return;
      if (!isPage(res.data)) throw new Error('lista fora do formato');
      const next = res.data;
      setItems((prev) => {
        const seen = new Set((prev ?? []).map((m) => m.id));
        return [...(prev ?? []), ...next.items.filter((m) => !seen.has(m.id))];
      });
      setCursor(next.nextCursor ?? null);
    } catch (err) {
      if (id === listReq.current) setMoreError(serverErrorMessage(err, 'Não deu para carregar mais movimentos.'));
    } finally {
      if (id === listReq.current) {
        moreInFlight.current = false;
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadMovements(); }, [loadMovements]);

  // Aba de destino de cada cartão: só a que o papel vê no modo do resumo (esconder, nunca link morto).
  const dinheiro = summary
    ? visibleAdminAreas({ can, isCeo, settlementMode: summary.mode, custodyOpen: false }).find((a) => a.key === 'dinheiro')
    : undefined;
  const tabHref = (key: string) => dinheiro?.tabs.find((t) => t.key === key)?.href;

  const columns: AdminColumn<MoneyMovement>[] = [
    { key: 'hora', header: 'Hora', render: (m) => spTime(m.at) },
    {
      key: 'movimento', header: 'Movimento', primary: true,
      render: (m) => <StatusTag tone={MOVEMENT_TONE[m.type] ?? 'neutral'}>{m.label}</StatusTag>,
    },
    {
      key: 'pedido', header: 'Pedido',
      render: (m) => (m.orderId
        ? <Link href={`/order/${m.orderId}`} className={ui.link}>{shortId(m.orderId)}</Link>
        : '—'),
    },
    { key: 'pessoa', header: 'Pessoa', render: (m) => m.personName || '—' },
    { key: 'valor', header: 'Valor', align: 'right', render: (m) => formatMoney(m.amount) },
  ];

  return (
    <div className={ui.stack}>
      <section aria-label="Resumo do dinheiro">
        {summaryError ? (
          <LoadError message={summaryError} onRetry={loadSummary} />
        ) : !summary ? (
          <LoadSkeleton lines={2} />
        ) : (
          <SummaryCards s={summary} tabHref={tabHref} />
        )}
      </section>

      <div className={ui.split}>
        <section className={blocks.block} aria-label="Movimentos de hoje">
          <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Movimentos de hoje</h2></div>
          <div className={ui.toolbar}>
            <Select label="Tipo de movimento" value={type} onChange={setType} options={TYPE_OPTIONS} />
          </div>
          <AdminTable
            columns={columns}
            rows={items}
            rowKey={(m) => m.id}
            rowLabel={(m) => m.label}
            error={listError}
            onRetry={loadMovements}
            empty="Nenhuma movimentação hoje"
            caption="Movimentos de hoje"
          />
          {moreError && <p role="alert" className={blocks.errText}>{moreError}</p>}
          {items && !listError && cursor && (
            <div className={ui.loadMore}>
              <Button variant="secondary" className={ui.touch} loading={loadingMore} onClick={() => { void loadMore(); }}>
                {moreError ? 'Tentar de novo' : 'Carregar mais'}
              </Button>
            </div>
          )}
        </section>

        <section className={blocks.block} aria-label="Para onde foi o dinheiro hoje">
          <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Para onde foi o dinheiro hoje</h2></div>
          {summaryError ? (
            <p className={blocks.muted}>Sem o resumo do dia (veja o erro acima).</p>
          ) : !summary ? (
            <LoadSkeleton lines={4} />
          ) : (
            <MoneyFlowBlock flow={summary.whereMoneyWent} mode={summary.mode} />
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryCards({ s, tabHref }: { s: MoneySummary; tabHref: (key: string) => string | undefined }) {
  const w = s.withdrawalsToday;
  const withdrawHint = `${plural(w.count, 'Pix pago', 'Pix pagos')} · ${plural(w.pending, 'pedido agora', 'pedidos agora')}`
    + (w.uncertain > 0 ? ` · ${plural(w.uncertain, 'incerto', 'incertos')}` : '');
  return (
    <div className={blocks.kpis}>
      {s.custody && (
        <Kpi
          label="Em custódia"
          value={formatMoney(s.custody.amount)}
          hint={`${plural(s.custody.count, 'pedido pago', 'pedidos pagos')}, entrega em andamento`}
          href={tabHref('caixa')}
        />
      )}
      {s.toRelease ? (
        <Kpi
          label="A liberar"
          value={formatMoney(s.toRelease.amount)}
          hint={plural(s.toRelease.count, 'repasse aguardando', 'repasses aguardando')
            + (s.toRelease.uncertain > 0 ? ` · ${plural(s.toRelease.uncertain, 'incerto', 'incertos')}` : '')}
          href={tabHref('repasses')}
        />
      ) : (
        <Kpi label="A liberar" value="Automático" hint="Split automático no Asaas" />
      )}
      <Kpi label="Saques do dia" value={formatMoney(w.amount)} hint={withdrawHint} href={tabHref('saques')} />
      {s.refunds && (
        <Kpi
          label="Estornos em aberto"
          value={formatMoney(s.refunds.amount)}
          hint={plural(s.refunds.count, 'estorno a resolver', 'estornos a resolver')}
          href={tabHref('estornos')}
        />
      )}
      <Kpi
        label="Receita da plataforma hoje"
        value={formatMoney(s.platformRevenueToday)}
        hint="Comissões do dia"
        href={tabHref('caixa')}
      />
    </div>
  );
}

function MoneyFlowBlock({ flow, mode }: { flow: MoneyFlow; mode: MoneySummary['mode'] }) {
  if (flow.orders === 0) return <EmptyNote text="Nenhum pedido pago hoje" />;
  const total = flow.inFromCustomers > 0 ? flow.inFromCustomers : 1;
  const parts = [
    { key: 'lojas', label: 'Lojas (após comissão)', value: flow.toStores },
    { key: 'motoboys', label: 'Motoboys', value: flow.toMotoboys },
    { key: 'cartao', label: 'Custo do cartão (pago pelo cliente)', value: flow.gatewayCost },
    { key: 'drop', label: 'Fica com o DROP', value: flow.platform },
  ];
  return (
    <>
      <p className={blocks.muted}>{`${plural(flow.orders, 'pedido pago', 'pedidos pagos')} hoje`}</p>
      <dl className={ui.flow}>
        <div className={ui.flowRow}>
          <dt>Entrou dos clientes</dt>
          <dd>{formatMoney(flow.inFromCustomers)}</dd>
        </div>
        {parts.map((p) => (
          <div key={p.key} className={p.key === 'drop' ? `${ui.flowRow} ${ui.flowTotal}` : ui.flowRow}>
            <dt>{p.label}</dt>
            <dd>{formatMoney(p.value)}</dd>
            <ProgressBar value={p.value} max={total} label={p.label} valueText={formatMoney(p.value)} />
          </div>
        ))}
      </dl>
      {mode === 'direto' && (
        <p className={blocks.muted}>No modo direto a tarifa do Asaas é cobrada na conta da loja e não entra aqui.</p>
      )}
    </>
  );
}
