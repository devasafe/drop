import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import { AsaasConnectCard } from '../../components/drop/asaas/AsaasConnectCard';
import { useSaasConfig } from '../../hooks/useSaasConfig';
import { useAuth } from '../../contexts/AuthContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { formatBRL, formatBillingDate, saasStatusLabel } from '../../lib/saasBilling';
import styles from '../seller/Integrations.module.css';

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

const STATUS_LABEL = { none: 'Não conectada', valid: 'Chave válida', invalid: 'Chave inválida' } as const;

/** Só o CEO: trocar a conta Asaas de uma loja redireciona o dinheiro dela. */
export default function AdminLojasAsaas() {
  const router = useRouter();
  const { user } = useAuth() as any;
  const isCeo = (user?.activeRole || user?.role) === 'ceo';
  const { settlementMode, loading } = useSaasConfig();
  const [rows, setRows] = useState<StoreRow[]>([]);
  const [selected, setSelected] = useState<StoreRow | null>(null);
  const [egressIp, setEgressIp] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [billing, setBilling] = useState<Record<string, BillingRow>>({});
  const [feeInput, setFeeInput] = useState<Record<string, string>>({});
  const [feeMsg, setFeeMsg] = useState<Record<string, string>>({});
  const [feeBusy, setFeeBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/admin/stores/asaas');
      setRows(r.data?.data ?? []);
    } catch {
      setError('Não foi possível carregar as lojas.');
    }
  }, []);

  useEffect(() => {
    load();
    api.get('/admin/stores/saas-billing')
      .then((r) => {
        const list: BillingRow[] = r.data?.data ?? [];
        setBilling(Object.fromEntries(list.map((b) => [b.storeId, b])));
        setFeeInput(Object.fromEntries(list.map((b) => [b.storeId, b.customFee == null ? '' : String(b.customFee).replace('.', ',')])));
      })
      .catch(() => { /* mensalidade é complementar: a lista de contas segue */ });
    api.get('/settings/saas').then((r) => setEgressIp(r.data?.egressIp ?? null)).catch(() => { /* opcional */ });
  }, [load]);

  const direct = settlementMode === 'direto';

  // Valor especial (CEO): vazio = volta ao padrão; 0 = loja isenta.
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
      setBilling((b) => ({ ...b, [storeId]: { ...(b[storeId] || ({ storeId, status: null, paidUntil: null, trialEndsAt: null } as BillingRow)), customFee: d?.customFee ?? null, fee: d?.fee ?? b[storeId]?.fee ?? 0 } }));
      setFeeMsg((m) => ({ ...m, [storeId]: 'Valor salvo.' }));
    } catch (err: any) {
      setFeeMsg((m) => ({ ...m, [storeId]: err?.response?.data?.error || 'Não foi possível salvar o valor.' }));
    } finally {
      setFeeBusy(null);
    }
  };

  return (
    <ProtectedRoute required_role="ceo">
      <div className={styles.page}>
        <div className={styles.container}>
          <button className={styles.docsLink} onClick={() => router.push('/admin/dashboard')}>← Dashboard</button>
          <header className={styles.header}>
            <h1 className={styles.title}>Contas Asaas das lojas</h1>
            <p className={styles.subtitle}>Conecte, troque ou desconecte a conta Asaas de uma loja. Toda alteração fica registrada.</p>
          </header>
          {!loading && !direct && <p className={styles.subtitle}>A plataforma está no modo custódia; as contas por loja só valem no modo direto.</p>}
          {error && <p className={styles.subtitle}>{error}</p>}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {rows.map((s) => (
              <li key={s.storeId}>
                <button
                  className={styles.docsLink}
                  aria-pressed={selected?.storeId === s.storeId}
                  onClick={() => setSelected(s)}
                >
                  {s.name} — {STATUS_LABEL[s.status]}{s.apiKeyLast4 ? ` (••••${s.apiKeyLast4})` : ''}
                </button>
                {billing[s.storeId] && (
                  <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
                    <span>
                      Mensalidade: {saasStatusLabel(billing[s.storeId].status)}
                      {billing[s.storeId].status === 'trialing'
                        ? ` · teste até ${formatBillingDate(billing[s.storeId].trialEndsAt)}`
                        : ` · pago até ${formatBillingDate(billing[s.storeId].paidUntil)}`}
                      {' · '}{formatBRL(billing[s.storeId].fee)}
                    </span>
                    {isCeo && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                        <Input
                          aria-label={`Valor especial de ${s.name}`}
                          placeholder="Valor especial (R$) — vazio usa o padrão; 0 isenta"
                          value={feeInput[s.storeId] ?? ''}
                          onChange={(v) => setFeeInput((m) => ({ ...m, [s.storeId]: v }))}
                        />
                        <Button size="sm" loading={feeBusy === s.storeId} onClick={() => saveFee(s.storeId)}>Salvar valor</Button>
                        {feeMsg[s.storeId] && <span role="status">{feeMsg[s.storeId]}</span>}
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {selected && (
            <AsaasConnectCard
              key={selected.storeId}
              apiBase={`/admin/stores/${selected.storeId}/asaas`}
              storeId={selected.storeId}
              egressIp={egressIp}
              allowDisconnect
            />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
