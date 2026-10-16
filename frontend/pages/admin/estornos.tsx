/**
 * Dinheiro · Estornos (DS v2, D3a, tela 15). Só modo direto (menu directOnly).
 * Chamadas iguais às da página antiga (__tests__/admin.dinheiro.estornos.test.tsx):
 * GET /admin/direct-refunds { params: { status?, cursor? } } · POST /orders/:orderId/refund-direct ·
 * POST /admin/direct-refunds/:id/resolve { note }. Ações só com payout:release, como a rota.
 * A trava anti-duplo-estorno é do servidor (409 REFUND_ALREADY_DONE/IN_PROGRESS/UNCERTAIN); a tela mostra
 * o erro na folha e relê a lista, nunca reenvia sozinha. Um ref impede dois POSTs no mesmo clique duplo.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { AdminTable, type AdminColumn } from '../../components/admin/AdminTable';
import { AdminSheet } from '../../components/admin/AdminSheet';
import blocks from '../../components/admin/AdminBlocks.module.css';
import { StatusTag, type StatusTone } from '../../components/admin/StatusTag';
import ui from '../../components/admin/dinheiro/Dinheiro.module.css';
import { TextAreaField } from '../../components/admin/dinheiro/TextAreaField';
import { flattenServerError } from '../../components/admin/dinheiro/serverError';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import { isHttpStatus } from '../../lib/adminErrors';
import { formatMoney } from '../../lib/money';
import { humanizeRefundError, REFUND_STATUS_LABEL } from '../../lib/refundErrors';

interface Row {
  id: string;
  orderId: string;
  storeName: string | null;
  status: string;
  amount: number;
  attempts: number;
  lastError: string | null;
}

const FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'pending', label: 'Aguardando' },
  { value: 'failed', label: 'Falhou' },
  { value: 'failed_final', label: 'Falha final' },
  { value: 'uncertain', label: 'Incerto' },
  { value: 'done', label: 'Concluídos' },
];

const TONE: Record<string, StatusTone> = {
  pending: 'neutral', requested: 'info', done: 'ok', failed: 'warn', failed_final: 'bad', uncertain: 'bad',
};
const REFUNDABLE = ['pending', 'failed', 'failed_final'];

const refundLabel = (r: Row) =>
  `${r.status === 'failed_final' ? 'Reabrir e devolver' : 'Devolver'} ${formatMoney(Number(r.amount))}`;

export default function AdminEstornosPage() {
  const { can } = useAuth();
  const { showToast } = useToast();
  const canAct = typeof can === 'function' ? can('payout:release') : false;

  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<Row | null>(null);
  const [resolving, setResolving] = useState<Row | null>(null);
  const [note, setNote] = useState('');

  // Mesma geração de consulta da página antiga: resposta de uma lista velha nunca é anexada.
  const queryGen = useRef(0);
  // Trava síncrona contra clique duplo: vale antes de qualquer setState, ao contrário do `busy` da folha.
  const refundInFlight = useRef(false);
  const resolveInFlight = useRef(false);

  const load = useCallback(async () => {
    const gen = ++queryGen.current;
    setNextCursor(null);
    setMoreError(null);
    try {
      const r = await api.get('/admin/direct-refunds', { params: status ? { status } : {} });
      if (gen !== queryGen.current) return;
      setRows(r.data?.data ?? []);
      setNextCursor(r.data?.nextCursor ?? null);
      setError(null);
    } catch {
      if (gen === queryGen.current) setError('Não foi possível carregar os estornos.');
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const gen = queryGen.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const r = await api.get('/admin/direct-refunds', {
        params: status ? { status, cursor: nextCursor } : { cursor: nextCursor },
      });
      if (gen !== queryGen.current) return; // filtro mudou: resposta da lista antiga
      const more: Row[] = r.data?.data ?? [];
      setRows((prev) => {
        const base = prev ?? [];
        return [...base, ...more.filter((m) => !base.some((p) => p.id === m.id))];
      });
      setNextCursor(r.data?.nextCursor ?? null);
    } catch {
      if (gen === queryGen.current) setMoreError('Não deu para carregar mais. Tente de novo.');
    } finally {
      setLoadingMore(false);
    }
  };

  const refund = async () => {
    if (!refunding || refundInFlight.current) return;
    refundInFlight.current = true;
    try {
      await api.post(`/orders/${refunding.orderId}/refund-direct`);
    } catch (err) {
      // 409 = a trava do servidor viu outro estado (concluído, em andamento, incerto): relê a lista.
      if (isHttpStatus(err, 409)) void load();
      throw flattenServerError(err, 'Ação não concluída.');
    } finally {
      refundInFlight.current = false;
    }
    setRefunding(null);
    showToast('Devolução pedida ao Asaas.', 'success');
    await load();
  };

  const resolve = async () => {
    if (!resolving || resolveInFlight.current) return;
    resolveInFlight.current = true;
    try {
      await api.post(`/admin/direct-refunds/${resolving.id}/resolve`, { note: note.trim() });
    } catch (err) {
      throw flattenServerError(err, 'Ação não concluída.');
    } finally {
      resolveInFlight.current = false;
    }
    setResolving(null);
    setNote('');
    showToast('Estorno marcado como resolvido.', 'success');
    await load();
  };

  const columns: AdminColumn<Row>[] = [
    { key: 'loja', header: 'Loja', primary: true, render: (r) => r.storeName ?? 'Loja' },
    { key: 'pedido', header: 'Pedido', render: (r) => <span className={ui.mono}>{`#${String(r.orderId).slice(-6)}`}</span> },
    {
      key: 'situacao', header: 'Situação',
      render: (r) => (
        <span>
          <StatusTag tone={TONE[r.status] ?? 'neutral'}>{REFUND_STATUS_LABEL[r.status] ?? r.status}</StatusTag>
          <span className={ui.sub}>{`${r.attempts} tentativa(s)`}</span>
        </span>
      ),
    },
    {
      key: 'motivo', header: 'Por quê',
      render: (r) => {
        const msg = r.lastError && r.status !== 'done' ? humanizeRefundError(r.lastError) : null;
        return msg ? <span className={ui.errLine}>{msg}</span> : '—';
      },
    },
    { key: 'valor', header: 'Valor', align: 'right', render: (r) => formatMoney(Number(r.amount)) },
  ];

  const rowAction = (r: Row) => {
    if (!canAct || r.status === 'done' || r.status === 'requested') return null;
    return (
      <div className={ui.rowActions}>
        {REFUNDABLE.includes(r.status) && (
          <Button size="sm" className={ui.touch} onClick={() => setRefunding(r)}>{refundLabel(r)}</Button>
        )}
        <Button size="sm" variant="secondary" className={ui.touch} onClick={() => { setResolving(r); setNote(''); }}>
          Resolver com nota
        </Button>
      </div>
    );
  };

  return (
    <ProtectedRoute required_permission="payout:view">
      <AdminShell title="Dinheiro · Estornos" tabs="dinheiro">
        <div className={ui.stack}>
          <p className={blocks.muted}>
            Estornos de pedidos no modo direto. Em resultado incerto, confira no Asaas antes de qualquer ação: devolver de
            novo pode pagar o cliente duas vezes.
          </p>
          <section className={blocks.block} aria-label="Estornos">
            <div className={ui.toolbar}>
              <Select label="Filtrar por status" value={status} onChange={setStatus} options={FILTERS} />
            </div>
            <AdminTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              rowLabel={(r) => r.storeName ?? 'estorno'}
              error={error}
              onRetry={load}
              empty="Nenhum estorno encontrado"
              rowAction={rowAction}
            />
            {moreError && <p role="alert" className={ui.formError}>{moreError}</p>}
            {nextCursor && rows && !error && (
              <div className={ui.loadMore}>
                <Button variant="tertiary" className={ui.touch} loading={loadingMore} onClick={loadMore}>Carregar mais</Button>
              </div>
            )}
          </section>
        </div>

        <AdminSheet
          open={!!refunding}
          title={refunding ? `Devolver ${formatMoney(Number(refunding.amount))} ao cliente` : ''}
          onClose={() => setRefunding(null)}
          primary={{ label: 'Confirmar devolução', onClick: refund }}
        >
          {refunding && (
            <p className={blocks.muted}>
              {`O estorno do pedido #${String(refunding.orderId).slice(-6)} sai da conta de ${refunding.storeName ?? 'a loja'} no Asaas para o cliente.`}
              {refunding.status === 'failed_final' ? ' As tentativas tinham acabado: isto reabre o estorno.' : ''}
            </p>
          )}
        </AdminSheet>

        <AdminSheet
          open={!!resolving}
          title="Resolver estorno"
          onClose={() => setResolving(null)}
          primary={{ label: 'Confirmar resolução', disabled: note.trim().length < 10, onClick: resolve }}
        >
          <TextAreaField
            label="Nota da conferência"
            value={note}
            onChange={setNote}
            placeholder="Ex.: conferido no painel do Asaas, estorno concluído"
            hint="Mínimo de 10 caracteres. Fica no histórico do estorno."
          />
        </AdminSheet>
      </AdminShell>
    </ProtectedRoute>
  );
}
