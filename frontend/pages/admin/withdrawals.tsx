/**
 * Dinheiro · Saques (DS v2, D3a, telas 16 e 29). Só custódia (menu custodyOnly + whileCustodyOpen).
 * Chamadas iguais às da página antiga (__tests__/admin.dinheiro.saques.test.tsx):
 * GET /withdrawals/pending · /withdrawals/all · /withdrawals/ceo-wallet · /withdrawals/admin/config ·
 * POST /withdrawals/approve { withdrawalId } · POST /withdrawals/reject { withdrawalId, reason } ·
 * PUT /withdrawals/admin/config { enabled } · GET /admin/asaas/balance ·
 * POST /admin/asaas/fund-subaccount · POST /admin/asaas/fund-for-withdrawal { withdrawalId } ·
 * POST /withdrawals/:id/resolve-uncertain.
 * "Aprovar e pagar N" = runBatch, um saque por vez (o servidor reivindica cada saque antes do gateway).
 * K11: só o 409 WITHDRAWAL_NOT_PENDING conta como "já feito"; o resumo diz "concluídos", nunca "pagos".
 * O lote guarda o que foi selecionado: saque fora dessa lista (ou que saiu da fila) falha, nunca conta como feito.
 */
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import AdminShell from '../../components/admin/AdminShell';
import { AdminTable, type AdminColumn } from '../../components/admin/AdminTable';
import { AdminSheet } from '../../components/admin/AdminSheet';
import { BatchBar } from '../../components/admin/BatchBar';
import { Kpi } from '../../components/admin/Kpi';
import blocks from '../../components/admin/AdminBlocks.module.css';
import { EmptyNote, LoadError, LoadSkeleton } from '../../components/admin/LoadState';
import { StatusTag } from '../../components/admin/StatusTag';
import ui from '../../components/admin/dinheiro/Dinheiro.module.css';
import { AsaasTools, useAsaasBalance } from '../../components/admin/dinheiro/AsaasTools';
import { ResolveUncertainSheet, type ResolveOutcome } from '../../components/admin/dinheiro/ResolveUncertainSheet';
import { TextAreaField } from '../../components/admin/dinheiro/TextAreaField';
import { flattenServerError } from '../../components/admin/dinheiro/serverError';
import {
  bankSummary, isResolvable, isWithdrawalAlreadyHandled, isWithdrawalUncertain, withdrawalConflictMessage, withdrawalStatus, type Withdrawal,
} from '../../components/admin/dinheiro/withdrawalRules';
import { Button } from '../../components/ui/Button';
import { Switch } from '../../components/ui/Switch';
import { Tabs, tabPanelProps } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import { isConflictWithCode } from '../../lib/adminErrors';
import { formatMoney } from '../../lib/money';
import { batchSummaryText, retryFailed, runBatch, type BatchOptions, type BatchResult } from '../../lib/runBatch';

interface CeoWallet {
  balance?: number;
  transactions?: Array<{ description?: string; timestamp: string; amount: number }>;
}

interface Loaded {
  pending: Withdrawal[];
  all: Withdrawal[];
  ceoWallet: CeoWallet | null;
}

/** O lote e o que foi selecionado para ele (nome de cada saque no momento da confirmação). */
interface ApproveBatch {
  names: Record<string, string>;
  result: BatchResult<string>;
  /** 502 WITHDRAWAL_UNCERTAIN: o Pix pode ter saído; nunca reenviado. */
  uncertain: string[];
  /** Falharam e, ao tentar de novo, já não estavam pendentes: não reenviados (continuam como erro). */
  skipped: string[];
}

type TabId = 'pedidos' | 'historico' | 'carteira';

const WORDS = { one: 'concluído', many: 'concluídos' };
const UNCERTAIN_MSG = 'resultado incerto no Asaas. Confira no painel e use "Resolver saque incerto" no Histórico.';
const SKIPPED_MSG = 'já não estava pendente; não foi reenviado.';
const AUTO_ON = 'Ligada: saques pedidos são aprovados e pagos na hora.';
const AUTO_OFF = 'Desligada: cada saque precisa ser aprovado aqui.';

/** Saque que não está na lista do lote: erro com a mensagem, nunca "feito". */
const MISSING_ITEM = 'Esse saque não está mais na lista. Atualize a lista.';
const missingItemError = () => Object.assign(new Error(MISSING_ITEM), { response: { data: { error: MISSING_ITEM } } });

const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const nameOf = (w: Withdrawal) => w.motoboyName || 'Recebedor';

export default function AdminWithdrawalsPage() {
  const router = useRouter();
  const { user, loading: authLoading, can, permissionsLoading } = useAuth();
  const isCeo = (user?.activeRole || user?.role) === 'ceo';
  const { showToast } = useToast();
  const asaas = useAsaasBalance();

  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [autoApprove, setAutoApprove] = useState<boolean | null>(null);
  const [configError, setConfigError] = useState(false);
  const [tab, setTab] = useState<TabId>('pedidos');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [approveKeys, setApproveKeys] = useState<string[] | null>(null);
  const [batch, setBatch] = useState<ApproveBatch | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [rejecting, setRejecting] = useState<Withdrawal | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [funding, setFunding] = useState<Withdrawal | null>(null);
  const [resolving, setResolving] = useState<Withdrawal | null>(null);
  const [toggleTo, setToggleTo] = useState<boolean | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // Tela fechada: nada mais é enviado (vale também durante a releitura do "Tentar de novo").
  const unmountedRef = useRef(false);
  // Travas síncronas contra clique duplo: valem antes de qualquer setState (o `busy` da folha vem depois).
  const batchRunning = useRef(false);
  const rejectInFlight = useRef(false);
  const fundInFlight = useRef(false);
  const toggleInFlight = useRef(false);

  const allowed = can('withdrawal:view');
  const canApprove = can('withdrawal:approve');
  const canConfig = can('withdrawal:config');
  const canSeeBalance = can('cashbox:view');

  useEffect(() => {
    if (!authLoading && !permissionsLoading && user && !can('withdrawal:view')) {
      router.push('/access-denied');
    }
  }, [user, authLoading, permissionsLoading, can, router]);

  const loadData = useCallback(async (): Promise<Withdrawal[] | null> => {
    try {
      const [pendRes, allRes, walletRes] = await Promise.all([
        api.get('/withdrawals/pending'),
        api.get('/withdrawals/all'),
        api.get('/withdrawals/ceo-wallet'),
      ]);
      if (!Array.isArray(pendRes.data)) throw new Error('lista de pendentes inválida');
      const pending: Withdrawal[] = pendRes.data;
      setData({ pending, all: allRes.data?.withdrawals ?? [], ceoWallet: walletRes.data ?? null });
      setSelected((prev) => new Set(Array.from(prev).filter((k) => pending.some((w) => w._id === k))));
      setLoadError(null);
      return pending;
    } catch {
      setLoadError('Não deu para carregar os saques.');
      return null;
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const res = await api.get('/withdrawals/admin/config');
      setAutoApprove(!!res.data?.autoApproveWithdrawals);
      setConfigError(false);
    } catch {
      setAutoApprove(null);
      setConfigError(true);
    }
  }, []);

  useEffect(() => {
    if (!permissionsLoading && can('withdrawal:view')) {
      loadData();
      loadConfig();
    }
    // mesmas dependências da página antiga (l. 103-108)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, permissionsLoading]);

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
  const runApprove = async (keys: string[], names: Record<string, string>, prev?: ApproveBatch) => {
    if (batchRunning.current || unmountedRef.current) return;
    batchRunning.current = true;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const uncertain = new Set(prev?.uncertain ?? []);
    const skipped = prev?.skipped ?? [];
    const send = async (id: string) => {
      if (!Object.prototype.hasOwnProperty.call(names, id)) throw missingItemError();
      try {
        await api.post('/withdrawals/approve', { withdrawalId: id });
      } catch (err) {
        if (isWithdrawalUncertain(err)) uncertain.add(id);
        const own = withdrawalConflictMessage(err);
        if (own) throw { response: { status: 409, data: { error: own, code: 'WITHDRAWAL_NOT_PENDING' } } };
        throw err;
      }
    };
    const pack = (result: BatchResult<string>): ApproveBatch => ({ names, result, uncertain: Array.from(uncertain), skipped });
    setBatchBusy(true);
    try {
      const opts: BatchOptions<string> = {
        isAlreadyDone: isWithdrawalAlreadyHandled,
        onProgress: (r) => { if (!ctrl.signal.aborted) setBatch(pack(r)); },
        signal: ctrl.signal,
      };
      const result = prev
        ? await retryFailed({ ...prev.result, failed: keys }, send, opts)
        : await runBatch(keys, send, opts);
      if (ctrl.signal.aborted) return;
      setBatch(pack(result));
      setSelected(new Set(result.failed.filter((k) => !uncertain.has(k) && !skipped.includes(k))));
      showToast(batchSummaryText(result, WORDS), result.failed.length ? 'error' : 'success');
      await loadData();
    } finally {
      batchRunning.current = false;
      if (!ctrl.signal.aborted) setBatchBusy(false);
    }
  };

  const confirmBatch = () => {
    const keys = approveKeys ?? [];
    const names: Record<string, string> = {};
    for (const w of data?.pending ?? []) if (keys.includes(w._id)) names[w._id] = nameOf(w);
    setApproveKeys(null);
    void runApprove(keys, names);
  };

  /** Relê a lista e só reenvia o que falhou, não é incerto e ainda está pendente. */
  const retryBatch = async () => {
    if (!batch || batchRunning.current) return;
    batchRunning.current = true;
    let fresh: Withdrawal[] | null;
    try {
      fresh = await loadData();
    } finally {
      batchRunning.current = false;
    }
    if (unmountedRef.current) return; // tela fechada durante a releitura: nada é enviado
    if (!fresh) return; // sem a lista do servidor, nada é reenviado
    const still = new Set(fresh.map((w) => w._id));
    const candidates = batch.result.failed.filter((k) => !batch.uncertain.includes(k) && !batch.skipped.includes(k));
    const retryable = candidates.filter((k) => still.has(k));
    const next: ApproveBatch = { ...batch, skipped: [...batch.skipped, ...candidates.filter((k) => !still.has(k))] };
    setBatch(next);
    if (retryable.length) await runApprove(retryable, batch.names, next);
  };

  const submitReject = async () => {
    if (!rejecting || rejectInFlight.current) return;
    rejectInFlight.current = true;
    try {
      await api.post('/withdrawals/reject', { withdrawalId: rejecting._id, reason: rejectReason });
    } catch (err) {
      if (isConflictWithCode(err, 'WITHDRAWAL_NOT_PENDING')) void loadData();
      throw flattenServerError(err, 'Erro ao recusar o saque');
    } finally {
      rejectInFlight.current = false;
    }
    setRejecting(null);
    setRejectReason('');
    showToast('Saque recusado.', 'success');
    await loadData();
  };

  const submitFund = async () => {
    if (!funding || fundInFlight.current) return;
    fundInFlight.current = true;
    let message = '';
    try {
      const r = await api.post('/admin/asaas/fund-for-withdrawal', { withdrawalId: funding._id });
      message = r.data?.message || '';
    } catch (err) {
      throw flattenServerError(err, 'Falha ao abastecer a subconta');
    } finally {
      fundInFlight.current = false;
    }
    setFunding(null);
    showToast(message || 'Subconta abastecida.', 'success');
    if (canSeeBalance) void asaas.load();
  };

  const submitToggle = async () => {
    if (toggleTo === null || toggleInFlight.current) return;
    toggleInFlight.current = true;
    try {
      await api.put('/withdrawals/admin/config', { enabled: toggleTo });
    } catch (err) {
      throw flattenServerError(err, 'Erro ao alterar a configuração');
    } finally {
      toggleInFlight.current = false;
    }
    setAutoApprove(toggleTo);
    showToast(toggleTo ? 'Aprovação automática ligada.' : 'Aprovação automática desligada.', 'success');
    setToggleTo(null);
  };

  const onResolved = async (outcome: ResolveOutcome) => {
    setResolving(null);
    showToast(outcome === 'paid' ? 'Saque concluído.' : 'Saque voltou para pendente.', 'success');
    await loadData();
  };

  if (!authLoading && !permissionsLoading && !allowed) return null;

  const pending = data?.pending ?? [];
  const selectedSum = pending.filter((w) => selected.has(w._id)).reduce((s, w) => s + Number(w.amount), 0);
  const confirmItems = pending.filter((w) => approveKeys?.includes(w._id));
  const confirmSum = confirmItems.reduce((s, w) => s + Number(w.amount), 0);
  const n = approveKeys?.length ?? 0;

  const result = batch?.result ?? null;
  const retryable = batch && result
    ? result.failed.filter((k) => !batch.uncertain.includes(k) && !batch.skipped.includes(k))
    : [];
  const sent = result ? Object.values(result.states).filter((s) => s === 'done' || s === 'failed').length : 0;
  const total = result ? Object.keys(result.states).length : 0;
  const failLine = (k: string) => {
    if (!batch || !result) return '';
    const why = batch.uncertain.includes(k) ? UNCERTAIN_MSG : batch.skipped.includes(k) ? SKIPPED_MSG : result.errors[k];
    return `${batch.names[k] ?? 'Recebedor'}: ${why}`;
  };

  const pendingColumns: AdminColumn<Withdrawal>[] = [
    {
      key: 'quem', header: 'Quem', primary: true,
      render: (w) => (
        <span>
          {nameOf(w)}
          {w.motoboyEmail && <span className={ui.sub}>{w.motoboyEmail}</span>}
        </span>
      ),
    },
    { key: 'para', header: 'Para onde', render: (w) => bankSummary(w) ?? 'Pix cadastrado' },
    { key: 'quando', header: 'Pedido em', render: (w) => day(w.requestedAt) },
    { key: 'valor', header: 'Valor', align: 'right', render: (w) => formatMoney(Number(w.amount)) },
  ];

  const pendingAction = (w: Withdrawal) => {
    if (!canApprove && !isCeo) return null;
    return (
      <div className={ui.rowActions}>
        {canApprove && (
          <Button size="sm" className={ui.touch} disabled={batchBusy} onClick={() => setApproveKeys([w._id])}>
            Aprovar e pagar
          </Button>
        )}
        {canApprove && (
          <Button size="sm" variant="secondary" className={ui.touch} disabled={batchBusy} onClick={() => { setRejecting(w); setRejectReason(''); }}>
            Recusar
          </Button>
        )}
        {isCeo && (
          <Button size="sm" variant="tertiary" className={ui.touch} onClick={() => setFunding(w)}>
            Abastecer para este saque
          </Button>
        )}
      </div>
    );
  };

  const historyColumns: AdminColumn<Withdrawal>[] = [
    { key: 'quem', header: 'Quem', primary: true, render: (w) => nameOf(w) },
    {
      key: 'situacao', header: 'Situação',
      render: (w) => {
        const s = withdrawalStatus(w);
        return <StatusTag tone={s.tone}>{s.label}</StatusTag>;
      },
    },
    { key: 'quando', header: 'Pedido em', render: (w) => day(w.requestedAt) },
    { key: 'valor', header: 'Valor', align: 'right', render: (w) => formatMoney(Number(w.amount)) },
  ];

  const historyAction = (w: Withdrawal) => (isResolvable(w) && canApprove
    ? <Button size="sm" className={ui.touch} onClick={() => setResolving(w)}>Resolver saque incerto</Button>
    : null);

  const ceoTx = (data?.ceoWallet?.transactions ?? []).slice(-10).reverse();

  return (
    <AdminShell title="Dinheiro · Saques" tabs="dinheiro">
      {loadError ? (
        <LoadError message={loadError} onRetry={() => { loadData(); }} />
      ) : !data ? (
        <LoadSkeleton lines={6} />
      ) : (
        <div className={ui.stack}>
          <section className={blocks.block} aria-label="Aprovação automática">
            {configError ? (
              <LoadError message="Não deu para ler a aprovação automática." onRetry={loadConfig} />
            ) : autoApprove === null ? (
              <LoadSkeleton lines={1} />
            ) : canConfig ? (
              <Switch
                label="Aprovação automática de saques"
                checked={autoApprove}
                onChange={(next) => setToggleTo(next)}
                description={autoApprove ? AUTO_ON : AUTO_OFF}
              />
            ) : (
              <p className={blocks.muted}>
                Aprovação automática de saques: <strong>{autoApprove ? 'ligada' : 'desligada'}</strong>
              </p>
            )}
          </section>

          <AsaasTools
            state={asaas}
            canSeeBalance={canSeeBalance}
            canFund={isCeo}
            onFunded={() => { if (canSeeBalance) void asaas.load(); }}
          />

          {batch && result && (
            <section className={`${blocks.block} ${ui.result}`} aria-label="Resultado do lote" aria-live="polite">
              <h2 className={blocks.blockTitle}>
                {batchBusy ? `Pagando… ${sent} de ${total}` : `Lote: ${batchSummaryText(result, WORDS)}`}
              </h2>
              {result.failed.length > 0 && (
                <ul className={ui.resultList}>
                  {result.failed.map((k) => <li key={k}>{failLine(k)}</li>)}
                </ul>
              )}
              {batch.skipped.length > 0 && (
                <p className={blocks.muted}>
                  {batch.skipped.length === 1
                    ? '1 saque já não estava pendente e não foi reenviado.'
                    : `${batch.skipped.length} saques já não estavam pendentes e não foram reenviados.`}
                </p>
              )}
              {!batchBusy && retryable.length > 0 && (
                <div>
                  <Button className={ui.touch} onClick={() => { void retryBatch(); }}>Tentar de novo os que falharam</Button>
                </div>
              )}
            </section>
          )}

          <Tabs
            label="Saques"
            idPrefix="saques"
            value={tab}
            onChange={(id) => setTab(id as TabId)}
            items={[
              { id: 'pedidos', label: 'Pedidos', count: pending.length },
              { id: 'historico', label: 'Histórico' },
              { id: 'carteira', label: 'Carteira do CEO' },
            ]}
          />

          {tab === 'pedidos' && (
            <section className={blocks.block} {...tabPanelProps('pedidos', 'saques')}>
              <AdminTable
                columns={pendingColumns}
                rows={pending}
                rowKey={(w) => w._id}
                rowLabel={(w) => w.motoboyName || 'saque'}
                selectable={canApprove}
                selected={selected}
                onSelectedChange={setSelected}
                rowAction={pendingAction}
                empty="Nenhum saque pedido"
              />
            </section>
          )}

          {tab === 'historico' && (
            <section className={blocks.block} {...tabPanelProps('historico', 'saques')}>
              <AdminTable
                columns={historyColumns}
                rows={data.all}
                rowKey={(w) => w._id}
                rowAction={historyAction}
                empty="Nenhum saque registrado"
              />
            </section>
          )}

          {tab === 'carteira' && (
            <section className={blocks.block} {...tabPanelProps('carteira', 'saques')}>
              <Kpi
                label="Saldo disponível"
                value={typeof data.ceoWallet?.balance === 'number' ? formatMoney(data.ceoWallet.balance) : '—'}
              />
              <h3 className={blocks.blockTitle}>Últimas transações</h3>
              {ceoTx.length === 0 ? (
                <EmptyNote text="Nenhuma transação" />
              ) : (
                <ul className={ui.resultList}>
                  {ceoTx.map((tx, i) => (
                    <li key={`${tx.timestamp}-${i}`}>
                      {`${tx.description ?? 'Movimento'} · ${new Date(tx.timestamp).toLocaleString('pt-BR')} · `}
                      {`${tx.amount > 0 ? '+' : '−'}${formatMoney(Math.abs(tx.amount))}`}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {canApprove && (
            <BatchBar
              count={selected.size}
              summary={formatMoney(selectedSum)}
              actionLabel={`Aprovar e pagar ${selected.size}`}
              onAction={() => setApproveKeys(Array.from(selected))}
              busy={batchBusy}
              onClear={() => setSelected(new Set())}
            />
          )}
        </div>
      )}

      <AdminSheet
        open={!!approveKeys}
        title={`Aprovar e pagar ${n} ${n === 1 ? 'saque' : 'saques'}`}
        onClose={() => setApproveKeys(null)}
        primary={{ label: `Aprovar e pagar ${n}`, onClick: confirmBatch }}
      >
        <p className={blocks.muted}>
          {`Total ${formatMoney(confirmSum)}. O Pix sai da subconta de cada pessoa na hora, um saque por vez. Se um falhar, os outros seguem.`}
        </p>
        <ul className={ui.resultList}>
          {confirmItems.map((w) => <li key={w._id}>{`${nameOf(w)} · ${formatMoney(Number(w.amount))}`}</li>)}
        </ul>
      </AdminSheet>

      <AdminSheet
        open={!!rejecting}
        title={rejecting ? `Recusar saque de ${rejecting.motoboyName || 'recebedor'}` : ''}
        onClose={() => setRejecting(null)}
        primary={{ label: 'Recusar saque', tone: 'danger', disabled: !rejectReason.trim(), onClick: submitReject }}
      >
        {rejecting && <p className={blocks.muted}>{`${formatMoney(Number(rejecting.amount))}. O valor volta para a pessoa e ela recebe o motivo.`}</p>}
        <TextAreaField label="Motivo da recusa" value={rejectReason} onChange={setRejectReason} placeholder="Ex: Dados bancários incorretos" />
      </AdminSheet>

      <AdminSheet
        open={!!funding}
        title="Abastecer subconta"
        onClose={() => setFunding(null)}
        primary={{ label: 'Confirmar abastecimento', onClick: submitFund }}
      >
        {funding && (
          <p className={blocks.muted}>
            {`Transfere da conta-mãe para a subconta de ${funding.motoboyName || 'recebedor'} o necessário para este saque de ${formatMoney(Number(funding.amount))}.`}
          </p>
        )}
      </AdminSheet>

      <AdminSheet
        open={toggleTo !== null}
        title={toggleTo ? 'Ligar a aprovação automática?' : 'Desligar a aprovação automática?'}
        onClose={() => setToggleTo(null)}
        primary={{ label: toggleTo ? 'Ligar' : 'Desligar', tone: toggleTo ? 'danger' : 'default', onClick: submitToggle }}
      >
        <p className={blocks.muted}>
          {toggleTo
            ? 'Novos saques serão aprovados e pagos assim que forem pedidos.'
            : 'Novos saques ficarão pendentes até alguém aprovar aqui.'}
        </p>
      </AdminSheet>

      <ResolveUncertainSheet
        withdrawal={resolving}
        onClose={() => setResolving(null)}
        onResolved={onResolved}
        onStale={() => { void loadData(); }}
      />
    </AdminShell>
  );
}
