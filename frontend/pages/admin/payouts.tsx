/**
 * Dinheiro · Repasses (DS v2, D3a, tela 3). Só custódia (menu custodyOnly + whileCustodyOpen).
 * Chamadas iguais às da página antiga (__tests__/admin.dinheiro.repasses.test.tsx):
 * GET /payouts/admin?status&recipientType&limit=100 · GET /payouts/admin/obligations · GET /payouts/admin/config ·
 * POST /payouts/admin/:id/release · POST /payouts/admin/:id/block { reason } · POST /payouts/admin/:id/unblock ·
 * PUT /payouts/admin/config { enabled } · GET /invoices/by-order/:orderId.
 * "Liberar N repasses" = runBatch, um por vez (o servidor confere "pending" antes de transferir).
 * K10: "já feito" só pelo texto do servidor "(status atual: released|requested|paid)"; sem esse texto é erro, e o
 * "Tentar de novo" relê a lista e só reenvia o que ainda está aguardando liberação.
 * O lote guarda o que foi selecionado: repasse fora dessa lista (ou que saiu da fila) falha, nunca conta como feito.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { AdminTable, type AdminColumn } from '../../components/admin/AdminTable';
import { AdminSheet } from '../../components/admin/AdminSheet';
import { BatchBar } from '../../components/admin/BatchBar';
import { Kpi } from '../../components/admin/Kpi';
import blocks from '../../components/admin/AdminBlocks.module.css';
import { LoadError, LoadSkeleton } from '../../components/admin/LoadState';
import { StatusTag } from '../../components/admin/StatusTag';
import ui from '../../components/admin/dinheiro/Dinheiro.module.css';
import { PayoutDetails, type PayoutInvoice } from '../../components/admin/dinheiro/PayoutDetails';
import { TextAreaField } from '../../components/admin/dinheiro/TextAreaField';
import {
  isPayoutAlreadyReleased, isReadyToRelease, payoutStatus, recipientName, releaseSummary, type Payout,
} from '../../components/admin/dinheiro/payoutRules';
import { flattenServerError } from '../../components/admin/dinheiro/serverError';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Switch } from '../../components/ui/Switch';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { batchSummaryText, retryFailed, runBatch, type BatchOptions, type BatchResult } from '../../lib/runBatch';

/** O lote e o que foi selecionado para ele (nome de cada repasse no momento da confirmação). */
interface ReleaseBatch {
  names: Record<string, string>;
  result: BatchResult<string>;
  /** Falharam e, ao tentar de novo, já não estavam aguardando liberação: não reenviados (continuam como erro). */
  skipped: string[];
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todas as situações' },
  { value: 'pending', label: 'Aguardando liberação' },
  { value: 'released', label: 'Liberado' },
  { value: 'requested', label: 'Saque pedido' },
  { value: 'paid', label: 'Pago' },
  { value: 'cancelled', label: 'Cancelado' },
];
const TYPE_OPTIONS = [
  { value: '', label: 'Todos os tipos' },
  { value: 'store', label: 'Loja' },
  { value: 'motoboy', label: 'Motoboy' },
];
const WORDS = { one: 'concluído', many: 'concluídos' };
const SKIPPED_MSG = 'já não estava aguardando liberação; não foi reenviado.';
const AUTO_ON = 'Ligada: o repasse é liberado sozinho depois da entrega (menos os bloqueados).';
const AUTO_OFF = 'Desligada: o repasse só fica disponível para saque depois que alguém liberar aqui.';

/** Repasse que não está na lista do lote: erro com a mensagem, nunca "feito". */
const MISSING_ITEM = 'Esse repasse não está mais na lista. Atualize a lista.';
const missingItemError = () => Object.assign(new Error(MISSING_ITEM), { response: { data: { error: MISSING_ITEM } } });

const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const plural = (n: number) => `${n} ${n === 1 ? 'repasse' : 'repasses'}`;

export default function AdminPayoutsPage() {
  const { can } = useAuth();
  const { showToast } = useToast();
  const canRelease = can('payout:release');
  const canBlock = can('payout:block');
  const canConfig = can('payout:config');

  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState<string | null>(null);
  const [obligations, setObligations] = useState<number | null>(null);
  const [obligationsError, setObligationsError] = useState(false);
  const [autoApprove, setAutoApprove] = useState<boolean | null>(null);
  const [configError, setConfigError] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [releaseKeys, setReleaseKeys] = useState<string[] | null>(null);
  const [batch, setBatch] = useState<ReleaseBatch | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [blocking, setBlocking] = useState<Payout | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [unblocking, setUnblocking] = useState<Payout | null>(null);
  const [toggleTo, setToggleTo] = useState<boolean | null>(null);
  const [details, setDetails] = useState<Payout | null>(null);
  const [invoice, setInvoice] = useState<PayoutInvoice | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // Tela fechada: nada mais é enviado (vale também durante a releitura do "Tentar de novo").
  const unmountedRef = useRef(false);
  // Travas síncronas contra clique duplo: valem antes de qualquer setState (o `busy` da folha vem depois).
  const batchRunning = useRef(false);
  const blockInFlight = useRef(false);
  const unblockInFlight = useRef(false);
  const toggleInFlight = useRef(false);

  const fetchPayouts = useCallback(async (): Promise<Payout[] | null> => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('recipientType', typeFilter);
      params.set('limit', '100');
      const res = await api.get(`/payouts/admin?${params}`);
      const list: Payout[] = res.data?.payouts || [];
      setPayouts(list);
      setTotal(res.data?.total || 0);
      setListError(null);
      setSelected((prev) => new Set(Array.from(prev).filter((k) => list.some((p) => p._id === k && isReadyToRelease(p)))));
      return list;
    } catch {
      setListError('Não deu para carregar os repasses.');
      return null;
    }
  }, [statusFilter, typeFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/payouts/admin/obligations');
      setObligations(Number(res.data?.pendingObligations || 0));
      setObligationsError(false);
    } catch {
      setObligations(null);
      setObligationsError(true);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await api.get('/payouts/admin/config');
      setAutoApprove(!!res.data?.autoApprovePayouts);
      setConfigError(false);
    } catch {
      setAutoApprove(null);
      setConfigError(true);
    }
  }, []);

  // Mesma ordem da página antiga: a cada troca de filtro, lista e obrigações; a config só ao abrir.
  useEffect(() => { fetchPayouts(); fetchStats(); }, [fetchPayouts, fetchStats]);
  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  // Nota de serviço do pedido do repasse aberto (pode não existir em repasses antigos).
  useEffect(() => {
    setInvoice(null);
    if (!details?.orderId) return;
    let alive = true;
    api.get(`/invoices/by-order/${details.orderId}`)
      .then((r) => { if (alive) setInvoice(r.data); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [details?._id, details?.orderId]);

  // Fechar a tela no meio de um lote para o lote (o que já foi feito fica feito). abort() só aqui.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      abortRef.current?.abort();
    };
  }, []);

  /**
   * Roda o lote. Começa no clique (nunca num efeito). `names` é o que foi selecionado: só essas chaves são
   * enviadas; uma chave fora dela falha sem POST.
   */
  const runRelease = async (keys: string[], names: Record<string, string>, prev?: ReleaseBatch) => {
    if (batchRunning.current || unmountedRef.current) return;
    batchRunning.current = true;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const skipped = prev?.skipped ?? [];
    const send = async (id: string) => {
      if (!Object.prototype.hasOwnProperty.call(names, id)) throw missingItemError();
      await api.post(`/payouts/admin/${id}/release`);
    };
    const pack = (result: BatchResult<string>): ReleaseBatch => ({ names, result, skipped });
    setBatchBusy(true);
    try {
      const opts: BatchOptions<string> = {
        isAlreadyDone: isPayoutAlreadyReleased,
        onProgress: (r) => { if (!ctrl.signal.aborted) setBatch(pack(r)); },
        signal: ctrl.signal,
      };
      const result = prev
        ? await retryFailed({ ...prev.result, failed: keys }, send, opts)
        : await runBatch(keys, send, opts);
      if (ctrl.signal.aborted) return;
      setBatch(pack(result));
      setSelected(new Set(result.failed.filter((k) => !skipped.includes(k))));
      showToast(batchSummaryText(result, WORDS), result.failed.length ? 'error' : 'success');
      await fetchPayouts();
      await fetchStats();
    } finally {
      batchRunning.current = false;
      if (!ctrl.signal.aborted) setBatchBusy(false);
    }
  };

  const confirmBatch = () => {
    if (batchRunning.current) return;
    const keys = releaseKeys ?? [];
    const names: Record<string, string> = {};
    for (const p of payouts ?? []) if (keys.includes(p._id) && isReadyToRelease(p)) names[p._id] = recipientName(p);
    setReleaseKeys(null);
    void runRelease(keys, names);
  };

  /** Relê a lista e só reenvia o que falhou e o servidor ainda mostra pendente e não bloqueado. */
  const retryBatch = async () => {
    if (!batch || batchRunning.current) return;
    batchRunning.current = true;
    let fresh: Payout[] | null;
    try {
      fresh = await fetchPayouts();
    } finally {
      batchRunning.current = false;
    }
    if (unmountedRef.current) return; // tela fechada durante a releitura: nada é enviado
    if (!fresh) return; // sem a lista do servidor, nada é reenviado
    const ready = new Set(fresh.filter(isReadyToRelease).map((p) => p._id));
    const candidates = batch.result.failed.filter((k) => !batch.skipped.includes(k));
    const retryable = candidates.filter((k) => ready.has(k));
    const next: ReleaseBatch = { ...batch, skipped: [...batch.skipped, ...candidates.filter((k) => !ready.has(k))] };
    setBatch(next);
    if (retryable.length) await runRelease(retryable, batch.names, next);
  };

  const submitBlock = async () => {
    if (!blocking || blockInFlight.current) return;
    blockInFlight.current = true;
    try {
      await api.post(`/payouts/admin/${blocking._id}/block`, { reason: blockReason.trim() });
    } catch (err) {
      throw flattenServerError(err, 'Erro ao bloquear o repasse');
    } finally {
      blockInFlight.current = false;
    }
    setBlocking(null);
    setBlockReason('');
    showToast('Repasse bloqueado.', 'success');
    await fetchPayouts();
    await fetchStats();
  };

  const submitUnblock = async () => {
    if (!unblocking || unblockInFlight.current) return;
    unblockInFlight.current = true;
    try {
      await api.post(`/payouts/admin/${unblocking._id}/unblock`);
    } catch (err) {
      throw flattenServerError(err, 'Erro ao desbloquear o repasse');
    } finally {
      unblockInFlight.current = false;
    }
    setUnblocking(null);
    showToast('Repasse desbloqueado.', 'success');
    await fetchPayouts();
    await fetchStats();
  };

  const submitToggle = async () => {
    if (toggleTo === null || toggleInFlight.current) return;
    toggleInFlight.current = true;
    try {
      await api.put('/payouts/admin/config', { enabled: toggleTo });
    } catch (err) {
      throw flattenServerError(err, 'Erro ao alterar a configuração');
    } finally {
      toggleInFlight.current = false;
    }
    setAutoApprove(toggleTo);
    showToast(toggleTo ? 'Liberação automática ligada.' : 'Liberação automática desligada.', 'success');
    setToggleTo(null);
  };

  const list = payouts ?? [];
  const ready = list.filter(isReadyToRelease);
  const others = list.filter((p) => !isReadyToRelease(p));
  const selectedSum = ready.filter((p) => selected.has(p._id)).reduce((s, p) => s + Number(p.amount), 0);
  const confirmItems = ready.filter((p) => releaseKeys?.includes(p._id));
  const confirmSum = confirmItems.reduce((s, p) => s + Number(p.amount), 0);
  const n = releaseKeys?.length ?? 0;
  const showReady = statusFilter === '' || statusFilter === 'pending';
  const showOthers = others.length > 0 || !showReady;

  const result = batch?.result ?? null;
  const retryable = batch && result ? result.failed.filter((k) => !batch.skipped.includes(k)) : [];
  const sent = result ? Object.values(result.states).filter((s) => s === 'done' || s === 'failed').length : 0;
  const totalInBatch = result ? Object.keys(result.states).length : 0;
  const failLine = (k: string) => {
    if (!batch || !result) return '';
    const why = batch.skipped.includes(k) ? SKIPPED_MSG : result.errors[k];
    return `${batch.names[k] ?? 'Recebedor'}: ${why}`;
  };

  const columns: AdminColumn<Payout>[] = [
    {
      key: 'recebedor', header: 'Recebedor', primary: true,
      render: (p) => (
        <span>
          {recipientName(p)}
          <span className={ui.sub}>{p.recipientType === 'store' ? 'Loja' : 'Motoboy'}</span>
        </span>
      ),
    },
    { key: 'pedido', header: 'Pedido', render: (p) => <span className={ui.mono}>{`#${String(p.orderId).slice(-6)}`}</span> },
    { key: 'data', header: 'Data', render: (p) => day(p.createdAt) },
    {
      key: 'situacao', header: 'Situação',
      render: (p) => {
        const s = payoutStatus(p);
        return (
          <span>
            <StatusTag tone={s.tone}>{s.label}</StatusTag>
            {p.blocked && <> <StatusTag tone="bad">Bloqueado</StatusTag></>}
            {p.blocked && p.blockReason && <span className={ui.sub}>{p.blockReason}</span>}
          </span>
        );
      },
    },
    { key: 'valor', header: 'Valor', align: 'right', render: (p) => formatMoney(Number(p.amount)) },
  ];

  const readyAction = (p: Payout) => (canRelease || canBlock ? (
    <div className={ui.rowActions}>
      {canRelease && <Button size="sm" className={ui.touch} disabled={batchBusy} onClick={() => setReleaseKeys([p._id])}>Liberar</Button>}
      {canBlock && (
        <Button size="sm" variant="secondary" className={ui.touch} disabled={batchBusy} onClick={() => { setBlocking(p); setBlockReason(''); }}>
          Bloquear
        </Button>
      )}
    </div>
  ) : null);

  const otherAction = (p: Payout) => (p.status === 'pending' && p.blocked && canBlock
    ? <Button size="sm" variant="secondary" className={ui.touch} onClick={() => setUnblocking(p)}>Desbloquear</Button>
    : null);

  return (
    <ProtectedRoute required_permission="payout:view">
      <AdminShell title="Dinheiro · Repasses" tabs="dinheiro">
        <div className={ui.stack}>
          <div className={blocks.kpis}>
            <Kpi label="Repasses na lista" value={listError || payouts === null ? '—' : String(total)} />
            <Kpi
              label="Obrigações pendentes"
              value={obligations === null ? '—' : formatMoney(obligations)}
              hint="Repasses e saques ainda a pagar"
            />
          </div>
          {obligationsError && <LoadError message="Não deu para ler as obrigações pendentes." onRetry={fetchStats} />}

          <section className={blocks.block} aria-label="Liberação automática">
            {configError ? (
              <LoadError message="Não deu para ler a liberação automática." onRetry={fetchConfig} />
            ) : autoApprove === null ? (
              <LoadSkeleton lines={1} />
            ) : canConfig ? (
              <Switch
                label="Liberação automática de repasses"
                checked={autoApprove}
                onChange={(next) => setToggleTo(next)}
                description={autoApprove ? AUTO_ON : AUTO_OFF}
              />
            ) : (
              <p className={blocks.muted}>
                Liberação automática de repasses: <strong>{autoApprove ? 'ligada' : 'desligada'}</strong>
              </p>
            )}
          </section>

          <div className={ui.toolbar}>
            <Select label="Situação" value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
            <Select label="Tipo" value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} />
          </div>

          {batch && result && (
            <section className={`${blocks.block} ${ui.result}`} aria-label="Resultado do lote" aria-live="polite">
              <h2 className={blocks.blockTitle}>
                {batchBusy ? `Liberando… ${sent} de ${totalInBatch}` : `Lote: ${batchSummaryText(result, WORDS)}`}
              </h2>
              {result.failed.length > 0 && (
                <ul className={ui.resultList}>
                  {result.failed.map((k) => <li key={k}>{failLine(k)}</li>)}
                </ul>
              )}
              {batch.skipped.length > 0 && (
                <p className={blocks.muted}>
                  {batch.skipped.length === 1
                    ? '1 repasse já não estava aguardando liberação e não foi reenviado.'
                    : `${batch.skipped.length} repasses já não estavam aguardando liberação e não foram reenviados.`}
                </p>
              )}
              {!batchBusy && retryable.length > 0 && (
                <div>
                  <Button className={ui.touch} onClick={() => { void retryBatch(); }}>Tentar de novo os que falharam</Button>
                </div>
              )}
            </section>
          )}

          {listError || payouts === null ? (
            <section className={blocks.block} aria-label="Repasses">
              <AdminTable columns={columns} rows={null} rowKey={(p) => p._id} error={listError} onRetry={fetchPayouts} />
            </section>
          ) : (
            <>
              {showReady && (
                <section className={blocks.block} aria-label="Aguardando liberação">
                  <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Aguardando liberação</h2></div>
                  <AdminTable
                    columns={columns}
                    rows={ready}
                    rowKey={(p) => p._id}
                    rowLabel={recipientName}
                    selectable={canRelease}
                    selected={selected}
                    onSelectedChange={setSelected}
                    rowAction={readyAction}
                    onRowClick={(p) => setDetails(p)}
                    empty="Nenhum repasse aguardando liberação"
                  />
                </section>
              )}
              {showOthers && (
                <section className={blocks.block} aria-label="Outros repasses">
                  <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Outros repasses</h2></div>
                  <AdminTable
                    columns={columns}
                    rows={others}
                    rowKey={(p) => p._id}
                    rowLabel={recipientName}
                    rowAction={otherAction}
                    onRowClick={(p) => setDetails(p)}
                    empty="Nenhum repasse nesta situação"
                  />
                </section>
              )}
            </>
          )}

          {canRelease && (
            <BatchBar
              count={selected.size}
              summary={formatMoney(selectedSum)}
              actionLabel={`Liberar ${plural(selected.size)}`}
              onAction={() => setReleaseKeys(Array.from(selected))}
              busy={batchBusy}
              onClear={() => setSelected(new Set())}
            />
          )}
        </div>

        <AdminSheet
          open={!!releaseKeys}
          title={`Liberar ${plural(n)}`}
          onClose={() => setReleaseKeys(null)}
          primary={{ label: `Liberar ${plural(n)}`, onClick: confirmBatch }}
        >
          <p className={blocks.muted}>{`Total ${formatMoney(confirmSum)} · ${releaseSummary(confirmItems)}`}</p>
          <p className={blocks.muted}>
            O valor fica disponível para saque na hora. É um repasse por vez: se um falhar, os outros seguem.
          </p>
        </AdminSheet>

        <AdminSheet
          open={!!blocking}
          title="Bloquear repasse"
          onClose={() => setBlocking(null)}
          primary={{ label: 'Bloquear repasse', tone: 'danger', disabled: !blockReason.trim(), onClick: submitBlock }}
        >
          {blocking && (
            <p className={blocks.muted}>
              {`${recipientName(blocking)} · ${formatMoney(Number(blocking.amount))}. O repasse fica parado até alguém desbloquear.`}
            </p>
          )}
          <TextAreaField label="Motivo do bloqueio" value={blockReason} onChange={setBlockReason} placeholder="Fraude, inconsistência…" />
        </AdminSheet>

        <AdminSheet
          open={!!unblocking}
          title="Desbloquear repasse"
          onClose={() => setUnblocking(null)}
          primary={{ label: 'Confirmar desbloqueio', onClick: submitUnblock }}
        >
          {unblocking && (
            <p className={blocks.muted}>
              {`${recipientName(unblocking)} · ${formatMoney(Number(unblocking.amount))}. Volta para "Aguardando liberação".`}
            </p>
          )}
        </AdminSheet>

        <AdminSheet
          open={toggleTo !== null}
          title={toggleTo ? 'Ligar a liberação automática?' : 'Desligar a liberação automática?'}
          onClose={() => setToggleTo(null)}
          primary={{ label: toggleTo ? 'Ligar' : 'Desligar', tone: toggleTo ? 'danger' : 'default', onClick: submitToggle }}
        >
          <p className={blocks.muted}>
            {toggleTo
              ? 'Novos repasses serão liberados assim que a entrega for confirmada (menos os bloqueados).'
              : 'Novos repasses ficarão aguardando até alguém liberar aqui.'}
          </p>
        </AdminSheet>

        <AdminSheet open={!!details} title="Detalhes do repasse" onClose={() => setDetails(null)} secondaryLabel="Fechar">
          {details && <PayoutDetails payout={details} invoice={invoice} />}
        </AdminSheet>
      </AdminShell>
    </ProtectedRoute>
  );
}
