import { useId, useState } from 'react';
import api from '../../../lib/api';
import { adminErrorMessage } from '../../../lib/adminErrors';
import { AdminSheet } from '../AdminSheet';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import type { SettlementMode } from './switches';
import styles from './ModoPlataforma.module.css';

interface Preview { from: SettlementMode; to: SettlementMode; confirmPhrase: string; blockers: string[]; risks: string[] }

const LABEL: Record<SettlementMode, string> = {
  direto: 'SaaS · cada loja recebe na própria conta Asaas',
  custodia: 'App · custódia na conta do DROP',
};
const SHORT: Record<SettlementMode, string> = { direto: 'SaaS', custodia: 'app' };

/**
 * Troca do modo de liquidação (só o CEO; o servidor confere de novo: CEO_ONLY e a frase).
 * Riscos e bloqueios vêm de GET /admin/switches/settlement-preview?to=; a troca é
 * PUT /admin/switches { settlementMode, confirmSettlement } com a frase exata.
 */
export function SettlementModeCard({ mode, onChanged }: { mode: SettlementMode; onChanged: (m: SettlementMode) => void }) {
  const titleId = useId();
  const target: SettlementMode = mode === 'direto' ? 'custodia' : 'direto';
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [warnings, setWarnings] = useState(0);

  const start = async () => {
    setOpen(true);
    setPreview(null);
    setPreviewError(null);
    setTyped('');
    setReason('');
    try {
      const r = await api.get('/admin/switches/settlement-preview', { params: { to: target } });
      setPreview(r.data);
    } catch (err) {
      setPreviewError(adminErrorMessage(err, 'Não foi possível calcular os riscos da troca.'));
    }
  };

  const confirm = async () => {
    const r = await api.put('/admin/switches', {
      settlementMode: target, confirmSettlement: typed, ...(reason.trim() ? { changeReason: reason.trim() } : {}),
    });
    const w = r.data?.saasBillingWarnings;
    setWarnings(Array.isArray(w) ? w.length : 0);
    setOpen(false);
    onChanged(r.data.settlementMode);
  };

  const blocked = !!preview && preview.blockers.length > 0;

  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>Modo da plataforma</h2>
        <span className={styles.badge}>Só o CEO troca</span>
      </div>
      <p className={styles.current}>Atual: <strong>{LABEL[mode]}</strong></p>
      <p className={styles.desc}>A troca vale para os pedidos novos. Os pedidos em andamento terminam no modo em que foram criados.</p>
      {warnings > 0 && (
        <Alert tone="warning" title={`${warnings} assinatura(s) não cancelada(s) no Asaas`}>
          A troca valeu. O sistema tenta cancelar de novo sozinho.
        </Alert>
      )}
      <div className={styles.actions}>
        <Button variant="danger" onClick={start}>Trocar para o modo {SHORT[target]}</Button>
      </div>

      <AdminSheet
        open={open}
        title={`Trocar para o modo ${SHORT[target]}?`}
        onClose={() => setOpen(false)}
        primary={preview && !blocked
          ? { label: 'Confirmar troca', tone: 'danger', disabled: typed !== preview.confirmPhrase, onClick: confirm }
          : undefined}
      >
        {!preview && !previewError && <p className={styles.desc}>Calculando os riscos…</p>}
        {previewError && <Alert tone="error" title="Não deu para calcular os riscos">{previewError}</Alert>}
        {preview && blocked && (
          <Alert tone="error" title="A troca está bloqueada">
            <ul className={styles.list}>{preview.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          </Alert>
        )}
        {preview && !blocked && (
          <>
            <p className={styles.desc}>Vale para os pedidos novos. O que já está em andamento termina no modo em que começou.</p>
            <p className={styles.riskTitle}>Leia antes de confirmar</p>
            <ul className={styles.list}>{preview.risks.map((r) => <li key={r}>{r}</li>)}</ul>
            <Input
              label={`Digite ${preview.confirmPhrase} para confirmar`}
              value={typed}
              onChange={setTyped}
              autoComplete="off"
            />
            <Input label="Motivo (opcional)" value={reason} onChange={setReason} maxLength={500} />
          </>
        )}
      </AdminSheet>
    </section>
  );
}

export default SettlementModeCard;
