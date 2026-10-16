import { useCallback, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { AdminTable, type AdminColumn } from '../../components/admin/AdminTable';
import { AdminSheet } from '../../components/admin/AdminSheet';
import { Kpi } from '../../components/admin/Kpi';
import { StatusTag, type StatusTone } from '../../components/admin/StatusTag';
import { AsaasConnectCard } from '../../components/drop/asaas/AsaasConnectCard';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { useSaasConfig } from '../../hooks/useSaasConfig';
import { adminErrorMessage, isHttpStatus } from '../../lib/adminErrors';
import { flattenServerError } from '../../components/admin/dinheiro/serverError';
import { formatBRL, formatBillingDate, saasStatusLabel } from '../../lib/saasBilling';
import api from '../../lib/api';
import blocks from '../../components/admin/AdminBlocks.module.css';
import form from '../../components/admin/pessoas/PessoasForm.module.css';
import styles from '../../components/admin/pessoas/LojasAsaas.module.css';

interface StoreRow {
  storeId: string;
  name: string;
  status: 'none' | 'valid' | 'invalid';
  environment: 'sandbox' | 'production' | null;
  apiKeyLast4: string | null;
  lastCheckedAt: string | null;
}

interface BillingRow {
  storeId: string;
  status: string | null;
  paidUntil: string | null;
  trialEndsAt: string | null;
  customFee: number | null;
  fee: number;
}

const ASAAS_LABEL: Record<StoreRow['status'], string> = { none: 'Não conectada', valid: 'Chave válida', invalid: 'Chave inválida' };
const ASAAS_TONE: Record<StoreRow['status'], StatusTone> = { none: 'neutral', valid: 'ok', invalid: 'bad' };
const SAAS_TONE: Record<string, StatusTone> = { active: 'ok', trialing: 'info', past_due: 'warn', paused: 'bad', cancelled: 'neutral' };
const ENV_LABEL = { sandbox: 'sandbox', production: 'produção' } as const;

const billingDateText = (b: BillingRow) =>
  b.status === 'trialing' ? `teste até ${formatBillingDate(b.trialEndsAt)}` : `pago até ${formatBillingDate(b.paidUntil)}`;

/** Só o CEO: trocar a conta Asaas de uma loja redireciona o dinheiro dela (D3a, telas 27 e 28). */
export default function AdminLojasAsaas() {
  return (
    <ProtectedRoute required_role="ceo">
      <AdminShell title="Lojas · Asaas e mensalidades" tabs="lojas">
        <LojasAsaasScreen />
      </AdminShell>
    </ProtectedRoute>
  );
}

function LojasAsaasScreen() {
  const { user } = useAuth();
  const isCeo = (user?.activeRole || user?.role) === 'ceo';
  const { settlementMode, loading: modeLoading, error: modeError, retry: retryMode } = useSaasConfig();
  const { showToast } = useToast();

  const [rows, setRows] = useState<StoreRow[] | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [billing, setBilling] = useState<Record<string, BillingRow> | null>(null);
  const [billingError, setBillingError] = useState(false);
  const [egressIp, setEgressIp] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cardVersion, setCardVersion] = useState(0);
  const [feeInput, setFeeInput] = useState<Record<string, string>>({});
  const [feeMsg, setFeeMsg] = useState<Record<string, string>>({});
  const [feeBusy, setFeeBusy] = useState<string | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [confirmReq, setConfirmReq] = useState<{ message: string; resolve: (ok: boolean) => void } | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setRowsError(null);
    try {
      const r = await api.get('/admin/stores/asaas');
      setRows(r.data?.data ?? []);
    } catch (err) {
      setRowsError(isHttpStatus(err, 403) ? adminErrorMessage(err) : 'Não foi possível carregar as lojas.');
    }
  }, []);

  const loadBilling = useCallback(async () => {
    setBillingError(false);
    try {
      const r = await api.get('/admin/stores/saas-billing');
      const list: BillingRow[] = r.data?.data ?? [];
      setBilling(Object.fromEntries(list.map((b) => [b.storeId, b])));
      setFeeInput(Object.fromEntries(list.map((b) => [b.storeId, b.customFee == null ? '' : String(b.customFee).replace('.', ',')])));
    } catch {
      setBilling(null);
      setBillingError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadBilling();
    api.get('/settings/saas')
      .then((r) => setEgressIp(r.data?.egressIp ?? null))
      .catch(() => { /* opcional: o cartão mostra "IP ainda não informado" */ });
  }, [load, loadBilling]);

  const selected = rows?.find((s) => s.storeId === selectedId) ?? null;

  useEffect(() => {
    if (selectedId) detailRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [selectedId]);

  // Valor especial (CEO): vazio = volta ao padrão; 0 = loja isenta. Mesmas regras de hoje.
  const saveFee = async (storeId: string) => {
    const raw = (feeInput[storeId] ?? '').trim();
    const customFee = raw === '' ? null : Number(raw.replace(',', '.'));
    if (customFee !== null && (!Number.isFinite(customFee) || customFee < 0)) {
      setFeeMsg((m) => ({ ...m, [storeId]: 'Valor inválido.' }));
      return;
    }
    setFeeBusy(storeId);
    setFeeMsg((m) => ({ ...m, [storeId]: '' }));
    try {
      const r = await api.put(`/admin/stores/${storeId}/saas-billing`, { customFee });
      const d = r.data?.data;
      setBilling((b) => {
        const prev = b?.[storeId] ?? { storeId, status: null, paidUntil: null, trialEndsAt: null, customFee: null, fee: 0 };
        return { ...(b ?? {}), [storeId]: { ...prev, customFee: d?.customFee ?? null, fee: d?.fee ?? prev.fee ?? 0 } };
      });
      setFeeMsg((m) => ({ ...m, [storeId]: 'Valor salvo.' }));
    } catch (err) {
      const e = err as { response?: { data?: { error?: unknown } } };
      const text = typeof e?.response?.data?.error === 'string' ? e.response.data.error : 'Não foi possível salvar o valor.';
      setFeeMsg((m) => ({ ...m, [storeId]: text }));
    } finally {
      setFeeBusy(null);
    }
  };

  const disconnect = async () => {
    if (!selected) return;
    try {
      await api.delete(`/admin/stores/${selected.storeId}/asaas`);
    } catch (err) {
      // As rotas Asaas da loja respondem { error: { message, code } }: achata para a AdminSheet mostrar o texto (K18).
      throw flattenServerError(err);
    }
    showToast('Conta Asaas desconectada.', 'success');
    setCardVersion((v) => v + 1);
    // Relê a lista antes de fechar: o status e o "Desconectar conta Asaas" passam a refletir o servidor.
    await load();
    setDisconnectOpen(false);
  };

  // Confirmação do cartão (regerar token) numa AdminSheet, no lugar do window.confirm.
  const askConfirm = useCallback(
    (message: string) => new Promise<boolean>((resolve) => setConfirmReq({ message, resolve })),
    [],
  );
  const answerConfirm = (ok: boolean) => {
    confirmReq?.resolve(ok);
    setConfirmReq(null);
  };

  const billingList = billing ? Object.values(billing) : [];
  const countBy = (status: string) => billingList.filter((b) => b.status === status).length;

  const columns: AdminColumn<StoreRow>[] = [
    { key: 'loja', header: 'Loja', primary: true, render: (s) => s.name },
    {
      key: 'asaas',
      header: 'Conta Asaas',
      render: (s) => (
        <span className={styles.cell}>
          <StatusTag tone={ASAAS_TONE[s.status]}>{ASAAS_LABEL[s.status]}</StatusTag>
          {s.apiKeyLast4 && (
            <span className={styles.meta}>
              {`••••${s.apiKeyLast4}${s.environment ? ` · ${ENV_LABEL[s.environment]}` : ''}`}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'mensalidade',
      header: 'Mensalidade',
      render: (s) => {
        const b = billing?.[s.storeId];
        if (!billing) return <span className={styles.meta}>—</span>;
        if (!b) return <span className={styles.meta}>{saasStatusLabel(null)}</span>;
        return (
          <span className={styles.cell}>
            <StatusTag tone={SAAS_TONE[b.status ?? ''] ?? 'neutral'}>{saasStatusLabel(b.status)}</StatusTag>
            <span className={styles.meta}>{billingDateText(b)}</span>
          </span>
        );
      },
    },
    {
      key: 'valor',
      header: 'Valor',
      align: 'right',
      render: (s) => {
        const b = billing?.[s.storeId];
        if (!b) return <span className={styles.meta}>—</span>;
        return `${formatBRL(b.fee)}${b.customFee != null ? ' · especial' : ''}`;
      },
    },
  ];

  const b = selected ? billing?.[selected.storeId] : undefined;

  return (
    <div className={styles.page}>
      {modeError ? (
        <Alert
          tone="warning"
          title="Não deu para saber o modo da plataforma"
          action={retryMode ? { label: 'Tentar de novo', onClick: retryMode } : undefined}
        >
          As contas por loja só valem no modo direto.
        </Alert>
      ) : !modeLoading && settlementMode === 'custodia' ? (
        <Alert tone="info">A plataforma está no modo custódia; as contas por loja só valem no modo direto.</Alert>
      ) : null}

      {billingError ? (
        <Alert
          tone="warning"
          title="Não deu para carregar as mensalidades"
          action={{ label: 'Tentar de novo', onClick: () => void loadBilling() }}
        >
          A lista de contas Asaas continua abaixo.
        </Alert>
      ) : billing ? (
        <div className={blocks.kpis}>
          <Kpi label="Em dia" value={countBy('active')} />
          <Kpi label="Em teste" value={countBy('trialing')} />
          <Kpi label="Atrasadas" value={countBy('past_due')} />
          <Kpi label="Pausadas" value={countBy('paused')} />
        </div>
      ) : null}

      <AdminTable
        caption="Lojas"
        columns={columns}
        rows={rows}
        rowKey={(s) => s.storeId}
        rowLabel={(s) => s.name}
        error={rowsError}
        onRetry={() => { setRows(null); void load(); }}
        empty="Nenhuma loja cadastrada"
        onRowClick={(s) => setSelectedId(s.storeId)}
      />

      {selected && (
        <section ref={detailRef} className={styles.detail} aria-labelledby="loja-detalhe">
          <div className={blocks.blockHead}>
            <h2 id="loja-detalhe" className={blocks.blockTitle}>{selected.name}</h2>
            <Button size="sm" variant="tertiary" onClick={() => setSelectedId(null)}>Fechar detalhes</Button>
          </div>
          <div className={blocks.grid2}>
            <div className={styles.col}>
              <AsaasConnectCard
                key={`${selected.storeId}-${cardVersion}`}
                apiBase={`/admin/stores/${selected.storeId}/asaas`}
                storeId={selected.storeId}
                egressIp={egressIp}
                confirmAction={askConfirm}
                termsSignedByStore
              />
              {selected.status !== 'none' && (
                <Button variant="danger" className={form.touch} onClick={() => setDisconnectOpen(true)}>
                  Desconectar conta Asaas
                </Button>
              )}
            </div>
            <div className={blocks.block}>
              <h3 className={blocks.blockTitle}>Mensalidade</h3>
              {billingError ? (
                <p className={blocks.errText}>Não deu para carregar a mensalidade.</p>
              ) : !b ? (
                <p className={blocks.muted}>{saasStatusLabel(null)}</p>
              ) : (
                <>
                  <StatusTag tone={SAAS_TONE[b.status ?? ''] ?? 'neutral'}>{saasStatusLabel(b.status)}</StatusTag>
                  <p className={blocks.muted}>{billingDateText(b)} · {formatBRL(b.fee)} por mês</p>
                  {isCeo && (
                    <div className={styles.fee}>
                      <Input
                        className={styles.feeInput}
                        aria-label={`Valor especial de ${selected.name}`}
                        placeholder="Valor especial (R$): vazio usa o padrão; 0 isenta"
                        value={feeInput[selected.storeId] ?? ''}
                        onChange={(v) => setFeeInput((m) => ({ ...m, [selected.storeId]: v }))}
                      />
                      <Button size="sm" className={form.touch} loading={feeBusy === selected.storeId}
                        onClick={() => void saveFee(selected.storeId)}>
                        Salvar valor
                      </Button>
                      {feeMsg[selected.storeId] && <span role="status">{feeMsg[selected.storeId]}</span>}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      )}

      <AdminSheet
        open={disconnectOpen && selected !== null}
        title="Desconectar a conta Asaas"
        onClose={() => setDisconnectOpen(false)}
        primary={{ label: 'Desconectar', tone: 'danger', onClick: disconnect }}
      >
        {selected && (
          <p className={form.lead}>
            {selected.name}{selected.apiKeyLast4 ? ` · chave ••••${selected.apiKeyLast4}` : ''}
          </p>
        )}
        <ul className={styles.impact}>
          <li>Os pagamentos desta loja deixam de funcionar até uma nova chave ser conectada.</li>
          <li>A chave é apagada do DROP. Para voltar, é preciso colar a chave de novo e aceitar o termo.</li>
          <li>A desconexão fica registrada com o seu nome e a data.</li>
        </ul>
      </AdminSheet>

      <AdminSheet
        open={confirmReq !== null}
        title="Confirmar"
        onClose={() => answerConfirm(false)}
        primary={{ label: 'Continuar', onClick: () => answerConfirm(true) }}
      >
        <p className={blocks.muted}>{confirmReq?.message}</p>
      </AdminSheet>
    </div>
  );
}
