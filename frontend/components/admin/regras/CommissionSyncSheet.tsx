/**
 * Comissão por plano (D3b-3, spec 6): antes de salvar uma comissão de plano alterada, mostra o impacto
 * (GET /settings/commission-impact?plan=&value=) e pede a escolha de cada plano: "Manter as especiais"
 * (keep_special: só as lojas no valor do plano mudam) ou "Igualar todas" (all). Sem loja especial as duas dão o
 * mesmo resultado: não pergunta e vai keep_special. O salvar de verdade é da tela (onConfirm); erro dele aparece
 * dentro da folha (AdminSheet). Planos acrescentados com a folha aberta (409 do servidor) são lidos na hora.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminSheet } from '../AdminSheet';
import blocks from '../AdminBlocks.module.css';
import { LoadError, LoadSkeleton } from '../LoadState';
import { RadioRow } from '../../ui/RadioRow';
import api from '../../../lib/api';
import { adminErrorMessage } from '../../../lib/adminErrors';
import styles from './Taxas.module.css';

export type CommissionPlanKey = 'plan1' | 'plan2' | 'plan3';
export type CommissionSyncChoice = 'keep_special' | 'all';
export type CommissionSyncChoices = Partial<Record<CommissionPlanKey, CommissionSyncChoice>>;
export interface CommissionChange { plan: CommissionPlanKey; newValue: number }
export interface CommissionImpact {
  oldValue: number;
  newValue: number;
  atOldValue: number;
  special: Array<{ storeId: string; storeName: string; rate: number }>;
}

type ImpactState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; data: CommissionImpact };

export const PLAN_LABEL: Record<CommissionPlanKey, string> = { plan1: 'Plano 1', plan2: 'Plano 2', plan3: 'Plano 3' };

const SPECIAL_SHOWN = 8;
const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const lojas = (n: number) => `${n} ${n === 1 ? 'loja' : 'lojas'}`;
const isImpact = (d: unknown): d is CommissionImpact => {
  const x = d as CommissionImpact | null;
  return !!x && typeof x.oldValue === 'number' && typeof x.newValue === 'number'
    && typeof x.atOldValue === 'number' && Array.isArray(x.special);
};

export interface CommissionSyncSheetProps {
  /** null = fechada. */
  changes: CommissionChange[] | null;
  onClose: () => void;
  onConfirm: (choices: CommissionSyncChoices) => Promise<void>;
  /** Muda quando a tela quer reler o impacto de todos os planos e pedir a escolha de novo (409 do servidor). */
  reloadToken?: number;
}

export function CommissionSyncSheet({ changes, onClose, onConfirm, reloadToken = 0 }: CommissionSyncSheetProps) {
  const [impacts, setImpacts] = useState<Partial<Record<CommissionPlanKey, ImpactState>>>({});
  const [choices, setChoices] = useState<CommissionSyncChoices>({});
  // Planos (e valores) já pedidos ao servidor nesta abertura.
  const requested = useRef<Set<string>>(new Set());

  const loadOne = useCallback(async (c: CommissionChange) => {
    setImpacts((prev) => ({ ...prev, [c.plan]: { status: 'loading' } }));
    try {
      const res = await api.get(`/settings/commission-impact?plan=${c.plan}&value=${c.newValue}`);
      if (!isImpact(res.data)) throw new Error('impacto fora do formato');
      const data = res.data;
      setImpacts((prev) => ({ ...prev, [c.plan]: { status: 'ok', data } }));
      if (data.special.length === 0) setChoices((prev) => ({ ...prev, [c.plan]: prev[c.plan] ?? 'keep_special' }));
    } catch (err) {
      setImpacts((prev) => ({ ...prev, [c.plan]: { status: 'error', message: adminErrorMessage(err, 'Não deu para calcular o impacto.') } }));
    }
  }, []);

  const lastToken = useRef(reloadToken);
  const signature = changes ? changes.map((c) => `${c.plan}:${c.newValue}`).join('|') : '';
  useEffect(() => {
    if (!changes) {
      requested.current = new Set();
      setImpacts({});
      setChoices({});
      return;
    }
    if (lastToken.current !== reloadToken) {
      lastToken.current = reloadToken;
      requested.current = new Set();
      setChoices({});
    }
    for (const c of changes) {
      const k = `${c.plan}:${c.newValue}`;
      if (!requested.current.has(k)) {
        requested.current.add(k);
        void loadOne(c);
      }
    }
    // `changes` entra pela assinatura (a tela cria um array novo a cada render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, reloadToken, loadOne]);

  const list = changes ?? [];
  const ready = list.length > 0 && list.every((c) => impacts[c.plan]?.status === 'ok' && !!choices[c.plan]);
  const confirm = () => {
    const picked: CommissionSyncChoices = {};
    for (const c of list) picked[c.plan] = choices[c.plan];
    return onConfirm(picked);
  };

  return (
    <AdminSheet
      open={!!changes}
      title="Comissão alterada: e as lojas?"
      onClose={onClose}
      primary={{ label: 'Salvar e aplicar', disabled: !ready, onClick: confirm }}
    >
      <p className={blocks.muted}>
        Lojas com comissão especial podem manter a delas ou passar para o valor novo do plano. Nada muda antes de salvar.
      </p>
      {list.map((c) => {
        const st = impacts[c.plan];
        return (
          <section key={c.plan} className={styles.syncPlan} aria-label={PLAN_LABEL[c.plan]}>
            {!st || st.status === 'loading' ? (
              <LoadSkeleton lines={2} />
            ) : st.status === 'error' ? (
              <LoadError message={st.message} onRetry={() => { void loadOne(c); }} />
            ) : (
              <PlanImpact
                plan={c.plan}
                impact={st.data}
                choice={choices[c.plan]}
                onChoose={(v) => setChoices((prev) => ({ ...prev, [c.plan]: v }))}
              />
            )}
          </section>
        );
      })}
    </AdminSheet>
  );
}

function PlanImpact({ plan, impact, choice, onChoose }: {
  plan: CommissionPlanKey;
  impact: CommissionImpact;
  choice?: CommissionSyncChoice;
  onChoose: (c: CommissionSyncChoice) => void;
}) {
  const { oldValue, newValue, atOldValue, special } = impact;
  return (
    <>
      <h3 className={styles.syncTitle}>{`${PLAN_LABEL[plan]}: ${pct(oldValue)} → ${pct(newValue)}`}</h3>
      <p className={blocks.muted}>
        {`${lojas(atOldValue)} no valor do plano ${atOldValue === 1 ? 'passa' : 'passam'} para ${pct(newValue)}.`}
      </p>
      {special.length === 0 ? (
        <p className={blocks.muted}>Nenhuma loja tem comissão especial neste plano.</p>
      ) : (
        <>
          <p className={blocks.muted}>{`${lojas(special.length)} com comissão especial:`}</p>
          <ul className={styles.changeList}>
            {special.slice(0, SPECIAL_SHOWN).map((s) => <li key={s.storeId}>{`${s.storeName} · ${pct(s.rate)}`}</li>)}
            {special.length > SPECIAL_SHOWN && <li>{`e mais ${lojas(special.length - SPECIAL_SHOWN)}`}</li>}
          </ul>
          <fieldset className={styles.syncChoices}>
            <legend className={styles.label}>{`O que fazer com as especiais do ${PLAN_LABEL[plan]}?`}</legend>
            <RadioRow
              name={`sync-${plan}`}
              value="keep_special"
              checked={choice === 'keep_special'}
              onChange={() => onChoose('keep_special')}
              label="Manter as especiais"
              description={`Só ${atOldValue === 1 ? 'muda 1 loja' : `mudam as ${lojas(atOldValue)}`} do valor do plano.`}
            />
            <RadioRow
              name={`sync-${plan}`}
              value="all"
              checked={choice === 'all'}
              onChange={() => onChoose('all')}
              label="Igualar todas"
              description={`As ${lojas(atOldValue + special.length)} do plano passam para ${pct(newValue)}.`}
              tone="danger"
            />
          </fieldset>
        </>
      )}
    </>
  );
}

export default CommissionSyncSheet;
