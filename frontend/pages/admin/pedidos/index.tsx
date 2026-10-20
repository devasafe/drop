/**
 * Pedidos ao vivo (D3b-1, spec 3.2; protótipo tela 8). Permissão operation:view (padrão só CEO).
 * GET /admin/orders?filtro=&storeId=&cursor= → KPIs (meta) e a tabela, já ordenada pelo servidor (atenção
 * primeiro, depois o mais antigo), 50 por página com "Carregar mais". A linha abre /admin/pedidos/[id].
 * Atualização: o evento admin:order_changed (agrupado em 2 s) e a volta do socket relêem a 1ª página sem apagar
 * a tabela; com o socket caído, aviso "Recarregando a cada 30 s" e polling de 30 s.
 * Filtro de loja: não há rota de busca de lojas para operation:view; as opções são as lojas que já apareceram na
 * lista (as que têm pedido em andamento ou cancelado hoje).
 */
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '../../../components/ProtectedRoute';
import AdminShell from '../../../components/admin/AdminShell';
import blocks from '../../../components/admin/AdminBlocks.module.css';
import { AdminTable, type AdminColumn } from '../../../components/admin/AdminTable';
import { Kpi } from '../../../components/admin/Kpi';
import { LoadSkeleton } from '../../../components/admin/LoadState';
import { StatusTag } from '../../../components/admin/StatusTag';
import { serverErrorMessage } from '../../../components/admin/dinheiro/serverError';
import ui from '../../../components/admin/operacao/Operacao.module.css';
import { Button } from '../../../components/ui/Button';
import { Chip } from '../../../components/ui/Chip';
import { Select } from '../../../components/ui/Select';
import { ADMIN_ORDERS_POLL_MS, useAdminOrderChanged } from '../../../hooks/useAdminOrderChanged';
import {
  ATTENTION_LABEL, ATTENTION_TONE, ORDERS_FILTERS, adminOrderStatus, elapsedLabel, fetchAdminOrders, minutesLabel,
  orderTag, type AdminOrderRow, type AdminOrdersResponse, type OrdersFilter,
} from '../../../lib/adminOps';
import { formatMoney } from '../../../lib/money';

export default function AdminPedidosPage() {
  return (
    <ProtectedRoute required_permission="operation:view">
      <AdminShell title="Pedidos ao vivo">
        <PedidosAoVivo />
      </AdminShell>
    </ProtectedRoute>
  );
}

/** Lojas já vistas na lista (id → nome), para o filtro de loja. */
const withStores = (prev: Record<string, string>, items: AdminOrderRow[]): Record<string, string> => {
  const next = { ...prev };
  items.forEach((o) => { next[o.store.id] = o.store.name; });
  return next;
};

function PedidosAoVivo() {
  const [filter, setFilter] = useState<OrdersFilter>('atencao');
  const [storeId, setStoreId] = useState('');
  const [rows, setRows] = useState<AdminOrderRow[] | null>(null);
  const [meta, setMeta] = useState<AdminOrdersResponse['meta'] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stores, setStores] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  // Só a última leitura vale: trocar o filtro ou reler no evento descarta a resposta anterior.
  const req = useRef(0);
  // Trava síncrona contra clique duplo em "Carregar mais".
  const moreInFlight = useRef(false);

  /** `silent`: releitura do evento/polling volta à 1ª página sem apagar a tabela da tela. */
  const load = useCallback(async (silent = false) => {
    const id = ++req.current;
    moreInFlight.current = false;
    if (!silent) {
      setRows(null);
      setMeta(null);
      setCursor(null);
    }
    setError(null);
    setMoreError(null);
    setLoadingMore(false);
    try {
      const page = await fetchAdminOrders(filter, { storeId: storeId || null });
      if (id !== req.current) return;
      setRows(page.items);
      setMeta(page.meta);
      setCursor(page.nextCursor);
      setNow(Date.now());
      setStores((prev) => withStores(prev, page.items));
    } catch (err) {
      if (id === req.current) setError(serverErrorMessage(err, 'Não deu para carregar os pedidos.'));
    }
  }, [filter, storeId]);

  const refresh = useCallback(() => { void load(true); }, [load]);
  const { isConnected } = useAdminOrderChanged(refresh);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (isConnected) return undefined;
    const t = setInterval(refresh, ADMIN_ORDERS_POLL_MS);
    return () => clearInterval(t);
  }, [isConnected, refresh]);
  // "Há" anda sozinho entre uma leitura e outra.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const loadMore = async () => {
    if (!cursor || moreInFlight.current) return;
    moreInFlight.current = true;
    const id = req.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await fetchAdminOrders(filter, { storeId: storeId || null, cursor });
      if (id !== req.current) return;
      setRows((prev) => {
        const seen = new Set((prev ?? []).map((o) => o.id));
        return [...(prev ?? []), ...page.items.filter((o) => !seen.has(o.id))];
      });
      setCursor(page.nextCursor);
      setStores((prev) => withStores(prev, page.items));
    } catch (err) {
      if (id === req.current) setMoreError(serverErrorMessage(err, 'Não deu para carregar mais pedidos.'));
    } finally {
      if (id === req.current) {
        moreInFlight.current = false;
        setLoadingMore(false);
      }
    }
  };

  const storeOptions = [
    { value: '', label: 'Todas as lojas' },
    ...Object.entries(stores)
      .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
      .map(([value, label]) => ({ value, label })),
  ];

  const columns: AdminColumn<AdminOrderRow>[] = [
    {
      key: 'pedido', header: 'Pedido', primary: true,
      render: (o) => <Link href={`/admin/pedidos/${o.id}`} className={ui.link}>{orderTag(o.shortId)}</Link>,
    },
    {
      key: 'situacao', header: 'Situação',
      render: (o) => {
        const s = adminOrderStatus(o.status, o.deliveryStatus);
        return <StatusTag tone={s.tone}>{s.label}</StatusTag>;
      },
    },
    { key: 'loja', header: 'Loja', render: (o) => o.store.name },
    { key: 'motoboy', header: 'Motoboy', render: (o) => o.motoboy?.name ?? '—' },
    { key: 'ha', header: 'Há', render: (o) => elapsedLabel(o.stageSince, now) },
    {
      key: 'motivo', header: 'Por que importa',
      render: (o) => (o.attention
        ? <StatusTag tone={ATTENTION_TONE[o.attention]}>{ATTENTION_LABEL[o.attention]}</StatusTag>
        : '—'),
    },
    { key: 'total', header: 'Total', align: 'right', render: (o) => formatMoney(o.total) },
  ];

  return (
    <div className={ui.stack}>
      <section aria-label="Resumo dos pedidos">
        {error ? (
          <p className={blocks.muted}>Sem os números agora (veja o erro na lista).</p>
        ) : !meta ? (
          <LoadSkeleton lines={2} />
        ) : (
          <div className={blocks.kpis}>
            <Kpi label="Em andamento" value={meta.active} hint={`${meta.activePaid} pagos · ${meta.awaitingPix} aguardando Pix`} />
            <Kpi label="Precisam de atenção" value={meta.attention} />
            <Kpi label="Aceite médio" value={minutesLabel(meta.acceptAvgMin)} hint={`limite ${meta.acceptLimitMin} min`} />
            <Kpi label="Achar motoboy" value={minutesLabel(meta.findMotoboyAvgMin)} hint={`limite ${meta.poolTimeoutMin} min`} />
            <Kpi label="Entregues hoje" value={meta.deliveredToday} />
          </div>
        )}
      </section>

      <section className={blocks.block} aria-label="Pedidos">
        <div className={blocks.blockHead}>
          <h2 className={blocks.blockTitle}>Pedidos</h2>
          {!isConnected && <p className={ui.live} role="status">Recarregando a cada 30 s</p>}
        </div>
        {meta?.attentionTruncated && !error && (
          <p className={ui.live} role="status">Mostrando os 500 pedidos mais antigos com atenção</p>
        )}
        <div className={ui.filters} role="group" aria-label="Filtrar pedidos">
          {ORDERS_FILTERS.map((f) => (
            <Chip key={f.key} label={f.label} active={filter === f.key} onClick={() => setFilter(f.key)} />
          ))}
        </div>
        <div className={ui.toolbar}>
          <Select label="Loja" value={storeId} onChange={setStoreId} options={storeOptions} />
        </div>
        <AdminTable
          columns={columns}
          rows={rows}
          rowKey={(o) => o.id}
          rowLabel={(o) => orderTag(o.shortId)}
          error={error}
          onRetry={() => { void load(); }}
          empty="Nenhum pedido com esse filtro"
          caption="Pedidos"
        />
        {moreError && <p role="alert" className={blocks.errText}>{moreError}</p>}
        {rows && !error && cursor && (
          <div className={ui.loadMore}>
            <Button variant="secondary" className={ui.touch} loading={loadingMore} onClick={() => { void loadMore(); }}>
              {moreError ? 'Tentar de novo' : 'Carregar mais'}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
