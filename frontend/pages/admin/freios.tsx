import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useAuth } from '../../contexts/AuthContext';
import { SettlementSwitchCard } from '../../components/drop/settlement/SettlementSwitchCard';
import { Button } from '../../components/ui/Button';
import styles from './Freios.module.css';

type SwitchKey = 'rankingPrizesEnabled' | 'benefitsRedeemEnabled' | 'gamificationPointsEnabled';

interface SwitchDef { key: SwitchKey; title: string; on: string; off: string; cost: string }

const SWITCHES: SwitchDef[] = [
  {
    key: 'rankingPrizesEnabled',
    title: 'Prêmios do ranking',
    on: 'Ativo — dá pra distribuir os prêmios mensais (dinheiro na carteira dos top motoboys).',
    off: 'Pausado — nenhum prêmio é pago. A distribuição fica bloqueada.',
    cost: 'R$ 500 / 300 / 150 por mês',
  },
  {
    key: 'benefitsRedeemEnabled',
    title: 'Resgate de benefícios',
    on: 'Ativo — motoboys trocam pontos por benefícios (alguns creditam saldo real).',
    off: 'Pausado — o resgate fica bloqueado. Nenhum crédito é gerado.',
    cost: 'R$ 20 / 50 por resgate',
  },
  {
    key: 'gamificationPointsEnabled',
    title: 'Gamificação (pontos)',
    on: 'Ativo — motoboys acumulam pontos por corrida (alimenta ranking e resgates).',
    off: 'Pausado — não acumula pontos. As conquistas/badges continuam funcionando.',
    cost: 'Indireto (habilita ranking e resgates)',
  },
];

export default function FreiosPage() {
  const router = useRouter();
  const { user } = useAuth() as any;
  const isCeo = (user?.activeRole || user?.role) === 'ceo';
  const [state, setState] = useState<(Record<SwitchKey, boolean> & { settlementMode?: 'custodia' | 'direto'; saasMonthlyFee?: number; saasTrialDays?: number; saasGraceDays?: number; directTransfersEnabled?: boolean }) | null>(null);
  // Mensalidade SaaS (CEO): campos em texto para aceitar vírgula; validados ao salvar.
  const [fee, setFee] = useState('');
  const [trial, setTrial] = useState('');
  const [grace, setGrace] = useState('');
  const [pix, setPix] = useState(false);
  const [savingFee, setSavingFee] = useState(false);
  const [busy, setBusy] = useState<SwitchKey | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/admin/switches').then((r) => { setState(r.data); syncSaas(r.data); }).catch(() => setMsg('Falha ao carregar os freios.'));
  }, []);

  const syncSaas = (d: any) => {
    setFee(String(d?.saasMonthlyFee ?? 0).replace('.', ','));
    setTrial(String(d?.saasTrialDays ?? 14));
    setGrace(String(d?.saasGraceDays ?? 5));
    setPix(!!d?.directTransfersEnabled);
  };

  const saveSaas = async () => {
    const feeN = Number(fee.trim().replace(',', '.'));
    const trialN = Number(trial);
    const graceN = Number(grace);
    if (!Number.isFinite(feeN) || feeN < 0 || Math.abs(feeN * 100 - Math.round(feeN * 100)) > 1e-6) return setMsg('Valor padrão inválido (use no máximo 2 casas decimais).');
    if (!Number.isInteger(trialN) || trialN < 0 || trialN > 365) return setMsg('Dias de teste: inteiro de 0 a 365.');
    if (!Number.isInteger(graceN) || graceN < 0 || graceN > 60) return setMsg('Dias de tolerância: inteiro de 0 a 60.');
    setSavingFee(true);
    setMsg('');
    try {
      const r = await api.put('/admin/switches', { saasMonthlyFee: feeN, saasTrialDays: trialN, saasGraceDays: graceN, directTransfersEnabled: pix });
      setState(r.data);
      syncSaas(r.data);
    } catch (err: any) {
      setMsg(err?.response?.data?.error || 'Erro ao salvar.');
    } finally {
      setSavingFee(false);
    }
  };

  const toggle = async (key: SwitchKey) => {
    if (!state) return;
    setBusy(key);
    setMsg('');
    try {
      const r = await api.put('/admin/switches', { [key]: !state[key] });
      setState(r.data);
    } catch (err: any) {
      setMsg(err?.response?.data?.error || 'Erro ao salvar.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ProtectedRoute required_permission="settings:manage">
      <div className={styles.page}>
        <div className={styles.container}>
          <button className={styles.back} onClick={() => router.push('/admin/dashboard')}>← Dashboard</button>
          <header className={styles.header}>
            <h1 className={styles.title}>Freios da plataforma</h1>
            <p className={styles.subtitle}>Pause funções que custam dinheiro — ideal na fase grátis de lançamento.</p>
          </header>

          {msg && <div className={styles.msg}>{msg}</div>}

          {isCeo && state?.settlementMode && (
            <SettlementSwitchCard
              mode={state.settlementMode}
              onChanged={(m) => setState((prev) => (prev ? { ...prev, settlementMode: m } : prev))}
            />
          )}

          {isCeo && state && state.saasMonthlyFee !== undefined && (
            <section className={styles.card} aria-labelledby="saas-fee-title">
              <div className={styles.rowTitle} id="saas-fee-title">Mensalidade SaaS</div>
              <div className={styles.rowDesc}>Cobrança mensal das lojas no modo direto. O valor especial de cada loja fica em Contas Asaas.</div>
              <div className={styles.fields}>
                <label className={styles.field}>Valor padrão (R$)
                  <input type="text" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
                </label>
                <label className={styles.field}>Dias de teste
                  <input type="text" inputMode="numeric" value={trial} onChange={(e) => setTrial(e.target.value)} />
                </label>
                <label className={styles.field}>Dias de tolerância
                  <input type="text" inputMode="numeric" value={grace} onChange={(e) => setGrace(e.target.value)} />
                </label>
              </div>
              <label className={styles.check}>
                <input type="checkbox" checked={pix} onChange={(e) => setPix(e.target.checked)} />
                Pix automático ao motoboy
              </label>
              <div><Button onClick={saveSaas} loading={savingFee}>Salvar mensalidade</Button></div>
            </section>
          )}

          <div className={styles.list}>
            {SWITCHES.map((s) => {
              const on = state?.[s.key];
              return (
                <div key={s.key} className={`${styles.row} ${on ? styles.rowOn : styles.rowOff}`}>
                  <div className={styles.info}>
                    <div className={styles.rowTitle}>
                      {state == null ? s.title : on ? `🟢 ${s.title}` : `⏸️ ${s.title}`}
                      <span className={styles.costTag}>{s.cost}</span>
                    </div>
                    <div className={styles.rowDesc}>{state == null ? '—' : on ? s.on : s.off}</div>
                  </div>
                  <button
                    className={`${styles.toggle} ${on ? styles.togglePause : styles.toggleOn}`}
                    onClick={() => toggle(s.key)}
                    disabled={busy === s.key || state == null}
                  >
                    {busy === s.key ? '...' : on ? 'Pausar' : 'Ativar'}
                  </button>
                </div>
              );
            })}
          </div>

          <p className={styles.foot}>
            As <strong>conquistas/badges</strong> dos motoboys não custam nada e continuam ativas, mesmo com a gamificação pausada.
          </p>
        </div>
      </div>
    </ProtectedRoute>
  );
}
