import { useCallback, useEffect, useId, useState } from 'react';
import api from '../../../lib/api';
import { adminErrorMessage, isConflictWithCode } from '../../../lib/adminErrors';
import { formatMoney } from '../../../lib/money';
import { simulateOrder, type SimulationConfig } from '../../../lib/orderSimulation';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { Input } from '../../ui/Input';
import { Skeleton } from '../../ui/Skeleton';
import { useToast } from '../../ui/Toast';
import blocks from '../AdminBlocks.module.css';
import styles from './Taxas.module.css';
import {
  CommissionSyncSheet, PLAN_LABEL, type CommissionChange, type CommissionPlanKey, type CommissionSyncChoices,
} from './CommissionSyncSheet';

/**
 * Regras e taxas · Taxas e tempos (D3a, tela 22). GET /settings/platform-config e
 * PUT /settings/platform-config com a config INTEIRA editada (igual à tela antiga; o servidor grava só os campos que conhece).
 */
type ConfigKey =
  | 'commissionPlan1' | 'commissionPlan2' | 'commissionPlan3'
  | 'motoboyCutPerDelivery' | 'motoboyCutPerKm' | 'motoboyCommissionPercent'
  | 'motoboyMinimumWithdraw' | 'storeMinimumWithdraw'
  | 'cancelFeeCustomerPercent' | 'cancelFeeStorePercent' | 'cancelFeeMotoboyPercent'
  | 'storeAcceptTimeoutMin' | 'poolTimeoutMin' | 'customerAbsentWaitMin';

type PlatformConfig = Partial<Record<ConfigKey, number>> & { updatedAt?: string } & Record<string, unknown>;

interface FieldDef {
  key: ConfigKey;
  label: string;
  /** Nome curto no aviso "de → para". */
  short: string;
  unit: 'money' | 'percent' | 'minutes';
  step: string;
  int?: boolean;
  hint?: (v: number) => string;
}

const fmtNum = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

const SECTIONS: { title: string; note?: string; fields: FieldDef[] }[] = [
  {
    title: 'Comissão das lojas',
    fields: [
      { key: 'commissionPlan1', label: 'Plano 1 · vitrine (%)', short: 'Plano 1', unit: 'percent', step: '0.01', hint: (v) => `A loja recebe ${fmtNum(100 - v)}%` },
      { key: 'commissionPlan2', label: 'Plano 2 · com motoboys (%)', short: 'Plano 2', unit: 'percent', step: '0.01', hint: (v) => `A loja recebe ${fmtNum(100 - v)}%` },
      { key: 'commissionPlan3', label: 'Plano 3 · premium (%)', short: 'Plano 3', unit: 'percent', step: '0.01', hint: (v) => `A loja recebe ${fmtNum(100 - v)}%` },
    ],
  },
  {
    title: 'Entrega e motoboy',
    fields: [
      { key: 'motoboyCutPerDelivery', label: 'Taxa fixa por entrega (R$)', short: 'Taxa fixa', unit: 'money', step: '0.01' },
      { key: 'motoboyCutPerKm', label: 'Por km de rota (R$)', short: 'Por km', unit: 'money', step: '0.01', hint: (v) => `10 km = ${formatMoney(10 * v)}` },
      { key: 'motoboyCommissionPercent', label: 'Fica com o DROP (% da entrega)', short: 'Parte do DROP na entrega', unit: 'percent', step: '0.01', hint: (v) => `O motoboy fica com ${fmtNum(100 - v)}%` },
    ],
  },
  {
    title: 'Saque mínimo',
    fields: [
      { key: 'motoboyMinimumWithdraw', label: 'Saque mínimo do motoboy (R$)', short: 'Saque mínimo do motoboy', unit: 'money', step: '0.01', hint: () => 'Menor valor que o motoboy pode sacar de uma vez' },
      { key: 'storeMinimumWithdraw', label: 'Saque mínimo da loja (R$)', short: 'Saque mínimo da loja', unit: 'money', step: '0.01', hint: () => 'Menor valor que a loja pode sacar de uma vez' },
    ],
  },
  {
    title: 'Cancelamento',
    fields: [
      { key: 'cancelFeeCustomerPercent', label: 'Taxa de cancelamento do cliente (%)', short: 'Cancelamento do cliente', unit: 'percent', step: '0.01', hint: () => 'Cobrada do cliente no cancelamento tardio' },
      { key: 'cancelFeeStorePercent', label: 'Taxa de cancelamento da loja (%)', short: 'Cancelamento da loja', unit: 'percent', step: '0.01', hint: () => 'Quando a loja é responsável' },
      { key: 'cancelFeeMotoboyPercent', label: 'Taxa de cancelamento do motoboy (%)', short: 'Cancelamento do motoboy', unit: 'percent', step: '0.01', hint: () => 'Quando o motoboy é responsável' },
    ],
  },
  {
    title: 'Tempos',
    fields: [
      { key: 'storeAcceptTimeoutMin', label: 'Prazo para a loja aceitar (min)', short: 'Prazo da loja', unit: 'minutes', step: '1', int: true },
      { key: 'poolTimeoutMin', label: 'Prazo para achar motoboy (min)', short: 'Prazo do motoboy', unit: 'minutes', step: '1', int: true },
      { key: 'customerAbsentWaitMin', label: 'Espera pelo cliente ausente (min)', short: 'Espera pelo cliente', unit: 'minutes', step: '1', int: true },
    ],
  },
];

const FIELDS = SECTIONS.flatMap((s) => s.fields);

const fmtUnit = (f: FieldDef, v: number | undefined) => {
  if (v === undefined || !Number.isFinite(v)) return '—';
  if (f.unit === 'money') return formatMoney(v);
  if (f.unit === 'percent') return `${fmtNum(v)}%`;
  return `${fmtNum(v)} min`;
};
const sameNum = (a: number | undefined, b: number | undefined) => a === b || (Number.isNaN(a) && Number.isNaN(b));
const toSimNumber = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const PLAN_FIELDS: Record<CommissionPlanKey, ConfigKey> = {
  plan1: 'commissionPlan1', plan2: 'commissionPlan2', plan3: 'commissionPlan3',
};
const PLANS = Object.keys(PLAN_FIELDS) as CommissionPlanKey[];
const centsOf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) : NaN);

/** Planos cuja comissão mudou (comparação em centavos, como o servidor). */
function commissionChanges(config: PlatformConfig, edit: PlatformConfig): CommissionChange[] {
  return PLANS
    .filter((p) => centsOf(config[PLAN_FIELDS[p]]) !== centsOf(edit[PLAN_FIELDS[p]]))
    .map((p) => ({ plan: p, newValue: edit[PLAN_FIELDS[p]] as number }));
}

/** 409 COMMISSION_SYNC_CHOICE_REQUIRED: os planos que o servidor diz que mudaram de valor. */
function plansMissingChoice(err: unknown): CommissionPlanKey[] {
  if (!isConflictWithCode(err, 'COMMISSION_SYNC_CHOICE_REQUIRED')) return [];
  const plans = (err as { response?: { data?: { plans?: unknown } } }).response?.data?.plans;
  return Array.isArray(plans) ? plans.filter((p): p is CommissionPlanKey => PLANS.includes(p as CommissionPlanKey)) : [];
}

type SaveResponse = { config?: PlatformConfig; commissionSync?: Array<{ storesUpdated?: unknown }> };

export function TaxasTab() {
  const { showToast } = useToast();
  const simTitleId = useId();
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [edit, setEdit] = useState<PlatformConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [simValue, setSimValue] = useState('100');
  const [simKm, setSimKm] = useState('3');
  const [simPlan, setSimPlan] = useState<1 | 2 | 3>(2);
  const [syncChanges, setSyncChanges] = useState<CommissionChange[] | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api.get('/settings/platform-config');
      setConfig(res.data);
      setEdit(res.data);
    } catch (err) {
      setLoadError(adminErrorMessage(err, 'Erro ao carregar configurações'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loadError) {
    return (
      <div className={blocks.block}>
        <p className={blocks.errText} role="alert">{loadError}</p>
        <div><Button variant="secondary" onClick={load}>Tentar de novo</Button></div>
      </div>
    );
  }
  if (!config || !edit) {
    return (
      <div className={blocks.block} aria-busy="true" aria-label="Carregando">
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }

  const num = (c: PlatformConfig, k: ConfigKey) => c[k] as number | undefined;
  const changes = FIELDS.filter((f) => !sameNum(num(config, f.key), num(edit, f.key)));
  const invalid = FIELDS.filter((f) => !Number.isFinite(num(edit, f.key) as number));
  const n = changes.length;

  const setField = (f: FieldDef, raw: string) => {
    const v = f.int ? parseInt(raw, 10) : parseFloat(raw);
    setSaveError(null);
    setEdit((prev) => (prev ? { ...prev, [f.key]: v } : prev));
  };

  const applySaved = (raw: unknown) => {
    const data = (raw ?? {}) as SaveResponse;
    // O PUT devolve { config, commissionSync, message }; usar a config salva (antes os campos zeravam).
    const savedConfig = (data.config ?? raw) as PlatformConfig;
    setConfig(savedConfig);
    setEdit(savedConfig);
    const synced = Array.isArray(data.commissionSync) ? data.commissionSync : [];
    const stores = synced.reduce((s, x) => s + (Number(x.storesUpdated) || 0), 0);
    showToast(
      synced.length > 0 ? `Regras salvas · ${stores} ${stores === 1 ? 'loja atualizada' : 'lojas atualizadas'}` : 'Regras salvas',
      'success',
    );
  };

  const changesFor = (plans: CommissionPlanKey[]): CommissionChange[] =>
    plans.map((p) => ({ plan: p, newValue: edit[PLAN_FIELDS[p]] as number }));

  const save = async () => {
    const pending = commissionChanges(config, edit);
    if (pending.length > 0) {
      // Comissão alterada: antes de salvar, mostrar o impacto e pedir a escolha (spec 6).
      setSaveError(null);
      setSyncChanges(pending);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await api.put('/settings/platform-config', edit);
      applySaved(res.data);
    } catch (err) {
      const plans = plansMissingChoice(err);
      if (plans.length > 0) setSyncChanges(changesFor(plans));
      else setSaveError(adminErrorMessage(err, 'Erro ao salvar configurações'));
    } finally {
      setSaving(false);
    }
  };

  /** Salvar com a escolha de cada plano (chamado pela folha; erro aparece dentro dela). */
  const confirmSync = async (choices: CommissionSyncChoices) => {
    let data: unknown;
    try {
      data = (await api.put('/settings/platform-config', { ...edit, commissionSync: choices })).data;
    } catch (err) {
      const missing = plansMissingChoice(err).filter((p) => !(syncChanges ?? []).some((c) => c.plan === p));
      if (missing.length > 0) {
        setSyncChanges((prev) => [...(prev ?? []), ...changesFor(missing)]);
        throw {
          response: {
            status: 409,
            data: { error: `A comissão também mudou no servidor: ${missing.map((p) => PLAN_LABEL[p]).join(', ')}. Escolha abaixo e salve de novo.` },
          },
        };
      }
      throw err;
    }
    setSyncChanges(null);
    applySaved(data);
  };

  const simInput = { productTotal: toSimNumber(simValue), distanceKm: toSimNumber(simKm), plan: simPlan };
  const now = simulateOrder((invalid.length ? config : edit) as SimulationConfig, simInput);
  const before = simulateOrder(config as SimulationConfig, simInput);

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        {SECTIONS.map((s) => (
          <section key={s.title} className={blocks.block} aria-label={s.title}>
            <div className={blocks.blockHead}>
              <h2 className={blocks.blockTitle}>{s.title}</h2>
              {s.note && <span className={blocks.muted}>{s.note}</span>}
            </div>
            <div className={styles.fields}>
              {s.fields.map((f) => {
                const v = num(edit, f.key);
                const was = num(config, f.key);
                const changed = !sameNum(was, v);
                const bad = !Number.isFinite(v as number);
                const id = `cfg-${f.key}`;
                return (
                  <div key={f.key} className={[styles.field, changed && styles.fieldChanged].filter(Boolean).join(' ')}>
                    <label htmlFor={id} className={styles.label}>{f.label}</label>
                    <input
                      id={id}
                      type="number"
                      min="0"
                      step={f.step}
                      className={styles.input}
                      value={v !== undefined && Number.isFinite(v) ? String(v) : ''}
                      onChange={(e) => setField(f, e.target.value)}
                      aria-invalid={bad || undefined}
                      aria-describedby={`${id}-hint`}
                    />
                    <span id={`${id}-hint`} className={bad ? styles.err : changed ? styles.changedHint : styles.hint}>
                      {bad ? 'Preencha um número' : changed ? `Era ${fmtUnit(f, was)}` : (f.hint && v !== undefined ? f.hint(v) : '')}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {typeof config.updatedAt === 'string' && (
          <p className={blocks.muted}>Última alteração: {new Date(config.updatedAt).toLocaleDateString('pt-BR')}</p>
        )}
      </div>

      <aside className={styles.side}>
        <section className={blocks.block} aria-labelledby={simTitleId}>
          <h2 id={simTitleId} className={blocks.blockTitle}>Simulação de um pedido</h2>
          <p className={blocks.muted}>Modo App (custódia), com a fórmula de hoje. O custo do cartão não entra.</p>
          <div className={styles.simInputs}>
            <Input label="Valor dos produtos (R$)" value={simValue} onChange={setSimValue} inputMode="decimal" />
            <Input label="Distância (km)" value={simKm} onChange={setSimKm} inputMode="decimal" />
          </div>
          <div className={styles.planChips} role="group" aria-label="Plano da loja">
            {([1, 2, 3] as const).map((p) => (
              <Chip key={p} label={`Plano ${p}`} active={simPlan === p} onClick={() => setSimPlan(p)} />
            ))}
          </div>
          <dl className={styles.sum}>
            <div className={styles.sumRow}><dt>Cliente paga</dt><dd>{formatMoney(now.clientPays)}</dd></div>
            <div className={styles.sumRow}><dt>Loja recebe (−{fmtNum(now.storeCommissionPercent)}%)</dt><dd>{formatMoney(now.storeReceives)}</dd></div>
            <div className={styles.sumRow}>
              <dt>Motoboy ({fmtNum(now.motoboySharePercent)}% de {formatMoney(now.deliveryFee)})</dt>
              <dd>{formatMoney(now.motoboyReceives)}</dd>
            </div>
            <div className={`${styles.sumRow} ${styles.sumTotal}`}><dt>DROP fica com</dt><dd>{formatMoney(now.dropKeeps)}</dd></div>
          </dl>
          {n > 0 && <p className={blocks.muted}>Antes da mudança: {formatMoney(before.dropKeeps)}</p>}
        </section>

        {n > 0 && (
          <Alert tone="warning" title={n === 1 ? '1 mudança não salva' : `${n} mudanças não salvas`}>
            <ul className={styles.changeList}>
              {changes.map((f) => (
                <li key={f.key}>{f.short}: {fmtUnit(f, num(config, f.key))} → {fmtUnit(f, num(edit, f.key))}</li>
              ))}
            </ul>
          </Alert>
        )}
        {saveError && <Alert tone="error" title="Não salvou">{saveError}</Alert>}

        <div className={styles.saveRow}>
          <Button variant="secondary" onClick={() => { setEdit(config); setSaveError(null); }} disabled={n === 0 || saving}>Descartar</Button>
          <Button onClick={save} loading={saving} disabled={n === 0 || invalid.length > 0}>
            {n === 0 ? 'Nenhuma mudança' : n === 1 ? 'Salvar 1 mudança' : `Salvar ${n} mudanças`}
          </Button>
        </div>
      </aside>
      <CommissionSyncSheet changes={syncChanges} onClose={() => setSyncChanges(null)} onConfirm={confirmSync} />
    </div>
  );
}

export default TaxasTab;
