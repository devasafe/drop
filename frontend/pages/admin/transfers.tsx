/**
 * Dinheiro · Pix aos motoboys (DS v2, D3a, tela 30). Só modo direto (menu directOnly; serviço do modo direto).
 * Chamadas iguais às da página antiga (__tests__/admin.dinheiro.pix.test.tsx):
 * GET /admin/transfers { params: { status?, cursor? } } · POST /admin/transfers/:id/retry ·
 * POST /admin/transfers/:id/resolve { note }. Ações só com payout:release, como a rota.
 * Pix incerto nunca é reenviado: "Tentar agora" só existe em failed/failed_final.
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
import { flattenServerError, serverErrorMessage } from '../../components/admin/dinheiro/serverError';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { humanizeTransferError, TRANSFER_STATUS_LABEL } from '../../lib/transferErrors';

interface Row {
  id: string;
  orderId: string;
  storeName: string | null;
  motoboyName: string | null;
  status: string;
  amount: number;
  attempts: number;
  lastError: string | null;
  pixKeyMasked: string;
}

const FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'pending', label: 'Aguardando' },
  { value: 'requested', label: 'Em andamento' },
  { value: 'failed', label: 'Falhou' },
  { value: 'failed_final', label: 'Falha final' },
  { value: 'uncertain', label: 'Incerto' },
  { value: 'done', label: 'Pagos' },
];

const TONE: Record<string, StatusTone> = {
  pending: 'neutral', requested: 'info', done: 'ok', failed: 'warn', failed_final: 'bad', uncertain: 'bad',
};
const ACTIONABLE = ['failed', 'failed_final', 'uncertain'];
const RETRYABLE = ['failed', 'failed_final'];

const who = (r: Row) => `${r.storeName ?? 'Loja'} → ${r.motoboyName ?? 'Motoboy'}`;

export default function AdminTransfersPage() {
  const { can } = useAuth();
  const { showToast } = useToast();
  const canAct = typeof can === 'function' ? can('payout:release') : false;

  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Row | null>(null);
  const [note, setNote] = useState('');

  // Geração da consulta: cada carga da 1ª página (troca de filtro, recarga) invalida as respostas em voo,
  // e um "Carregar mais" disparado antes não anexa linhas da lista antiga (igual à página antiga).
  const queryGen = useRef(0);

  const load = useCallback(async () => {
    const gen = ++queryGen.current;
    setNextCursor(null);
    setMoreError(null);
    try {
      const r = await api.get('/admin/transfers', { params: status ? { status } : {} });
      if (gen !== queryGen.current) return;
      setRows(r.data?.data ?? []);
      setNextCursor(r.data?.nextCursor ?? null);
      setError(null);
    } catch {
      if (gen === queryGen.current) setError('Não foi possível carregar as transferências.');
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const gen = queryGen.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const r = await api.get('/admin/transfers', {
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

  const retry = async (r: Row) => {
    setBusy(r.id);
    try {
      await api.post(`/admin/transfers/${r.id}/retry`);
      showToast('Nova tentativa enviada.', 'success');
      await load();
    } catch (err) {
      showToast(serverErrorMessage(err, 'Ação não concluída.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const resolve = async () => {
    if (!resolving) return;
    try {
      await api.post(`/admin/transfers/${resolving.id}/resolve`, { note: note.trim() });
    } catch (err) {
      throw flattenServerError(err, 'Ação não concluída.');
    }
    setResolving(null);
    setNote('');
    showToast('Transferência marcada como resolvida.', 'success');
    await load();
  };

  const columns: AdminColumn<Row>[] = [
    { key: 'quem', header: 'Loja → motoboy', primary: true, render: who },
    { key: 'pedido', header: 'Pedido', render: (r) => <span className={ui.mono}>{`#${String(r.orderId).slice(-6)}`}</span> },
    {
      key: 'situacao', header: 'Situação',
      render: (r) => (
        <span>
          <StatusTag tone={TONE[r.status] ?? 'neutral'}>{TRANSFER_STATUS_LABEL[r.status] ?? r.status}</StatusTag>
          <span className={ui.sub}>{`${r.attempts} tentativa(s)${r.pixKeyMasked ? ` · Pix ${r.pixKeyMasked}` : ''}`}</span>
        </span>
      ),
    },
    {
      key: 'motivo', header: 'Motivo',
      render: (r) => {
        const msg = r.lastError && r.status !== 'done' ? humanizeTransferError(r.lastError) : null;
        return msg ? <span className={ui.errLine}>{msg}</span> : '—';
      },
    },
    { key: 'valor', header: 'Valor', align: 'right', render: (r) => formatMoney(Number(r.amount)) },
  ];

  const rowAction = (r: Row) => {
    if (!canAct || !ACTIONABLE.includes(r.status)) return null;
    return (
      <div className={ui.rowActions}>
        {RETRYABLE.includes(r.status) && (
          <Button size="sm" className={ui.touch} loading={busy === r.id} onClick={() => retry(r)}>Tentar agora</Button>
        )}
        <Button size="sm" variant="secondary" className={ui.touch} onClick={() => { setResolving(r); setNote(''); }}>
          Resolver
        </Button>
      </div>
    );
  };

  return (
    <ProtectedRoute required_permission="payout:view">
      <AdminShell title="Dinheiro · Pix aos motoboys" tabs="dinheiro">
        <div className={ui.stack}>
          <p className={blocks.muted}>
            Pix da loja ao motoboy no modo direto. Em resultado incerto, confira no painel do Asaas antes de marcar como
            resolvido: nunca reenviamos uma transferência incerta.
          </p>
          <section className={blocks.block} aria-label="Pix aos motoboys">
            <div className={ui.toolbar}>
              <Select label="Filtrar por status" value={status} onChange={setStatus} options={FILTERS} />
            </div>
            <AdminTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              rowLabel={who}
              error={error}
              onRetry={load}
              empty="Nenhuma transferência encontrada"
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
          open={!!resolving}
          title="Resolver Pix"
          onClose={() => setResolving(null)}
          primary={{ label: 'Confirmar resolução', disabled: note.trim().length < 10, onClick: resolve }}
        >
          {resolving && (
            <p className={blocks.muted}>
              {`Pix de ${formatMoney(Number(resolving.amount))} para ${resolving.motoboyName ?? 'o motoboy'}.`} Confira no
              painel do Asaas antes de resolver: se o Pix anterior já saiu, nunca reenvie.
            </p>
          )}
          <TextAreaField
            label="Nota da conferência"
            value={note}
            onChange={setNote}
            placeholder="Ex.: conferido no painel do Asaas, Pix concluído"
            hint="Mínimo de 10 caracteres. Fica no histórico da transferência."
          />
        </AdminSheet>
      </AdminShell>
    </ProtectedRoute>
  );
}
