import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
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
  const [state, setState] = useState<Record<SwitchKey, boolean> | null>(null);
  const [busy, setBusy] = useState<SwitchKey | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/admin/switches').then((r) => setState(r.data)).catch(() => setMsg('Falha ao carregar os freios.'));
  }, []);

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
