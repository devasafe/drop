import { useState } from 'react';
import api from '../../../lib/api';
import { Sheet } from '../../ui/Sheet';
import styles from './SettlementSwitchCard.module.css';

type Mode = 'custodia' | 'direto';

interface Preview { from: Mode; to: Mode; confirmPhrase: string; blockers: string[]; risks: string[] }

const LABEL: Record<Mode, string> = { direto: 'SaaS (cada loja recebe na própria conta Asaas)', custodia: 'App (custódia na conta da DROP)' };
const SHORT: Record<Mode, string> = { direto: 'SaaS', custodia: 'app' };

/**
 * Troca do modo de liquidação (só CEO). A troca acontece uma vez e muda para onde vai o
 * dinheiro dos pedidos novos: mostra os riscos calculados pelo servidor e só confirma
 * com a frase exata. O servidor confere a frase de novo (fail closed).
 */
export function SettlementSwitchCard({ mode, onChanged }: { mode: Mode; onChanged: (m: Mode) => void }) {
  const target: Mode = mode === 'direto' ? 'custodia' : 'direto';
  const [preview, setPreview] = useState<Preview | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    setOpen(true);
    setPreview(null);
    setTyped('');
    setError('');
    try {
      const r = await api.get('/admin/switches/settlement-preview', { params: { to: target } });
      setPreview(r.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Não foi possível calcular os riscos da troca.');
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.put('/admin/switches', { settlementMode: target, confirmSettlement: typed });
      setOpen(false);
      onChanged(r.data.settlementMode);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao trocar o modo.');
    } finally {
      setBusy(false);
    }
  };

  const blocked = !!preview && preview.blockers.length > 0;

  return (
    <div className={styles.card}>
      <div className={styles.title}>Modo da plataforma</div>
      <div className={styles.current}>Atual: <strong>{LABEL[mode]}</strong></div>
      <p className={styles.desc}>
        A troca vale para os pedidos novos. Os pedidos em andamento terminam no modo em que foram criados.
      </p>
      <button className={styles.switchBtn} onClick={start}>Trocar para o modo {SHORT[target]}</button>

      <Sheet open={open} onClose={() => !busy && setOpen(false)} title={`Trocar para o modo ${SHORT[target]}?`}>
        <div className={styles.sheetBody}>
          {!preview && !error && <p className={styles.desc}>Calculando os riscos…</p>}
          {preview && blocked && (
            <>
              <p className={styles.blockTitle}>A troca está bloqueada:</p>
              <ul className={styles.blockers}>{preview.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            </>
          )}
          {preview && !blocked && (
            <>
              <p className={styles.riskTitle}>Leia antes de confirmar:</p>
              <ul className={styles.risks}>{preview.risks.map((r) => <li key={r}>{r}</li>)}</ul>
              <label className={styles.label} htmlFor="settlement-confirm">
                Digite {preview.confirmPhrase} para confirmar
              </label>
              <input
                id="settlement-confirm"
                className={styles.input}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
              />
              <button className={styles.confirmBtn} onClick={confirm} disabled={busy || typed !== preview.confirmPhrase}>
                {busy ? 'Trocando…' : 'Confirmar troca'}
              </button>
            </>
          )}
          {error && <div className={styles.error}>{error}</div>}
        </div>
      </Sheet>
    </div>
  );
}
