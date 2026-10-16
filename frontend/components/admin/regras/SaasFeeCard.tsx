import { useEffect, useId, useState } from 'react';
import api from '../../../lib/api';
import { adminErrorMessage } from '../../../lib/adminErrors';
import { parseAmount } from '../../../lib/adminAmount';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Input } from '../../ui/Input';
import type { SwitchesState } from './switches';
import styles from './ModoPlataforma.module.css';

export interface SaasFeeValues {
  saasMonthlyFee?: number;
  saasTrialDays?: number;
  saasGraceDays?: number;
  directTransfersEnabled?: boolean;
}

/**
 * Mensalidade SaaS (só o CEO; o servidor recusa outro papel com CEO_ONLY). Mesmas validações da tela
 * antiga e o mesmo PUT /admin/switches { saasMonthlyFee, saasTrialDays, saasGraceDays, directTransfersEnabled }.
 */
export function SaasFeeCard({ initial, onSaved }: { initial: SaasFeeValues; onSaved: (next: SwitchesState) => void }) {
  const titleId = useId();
  const [fee, setFee] = useState('');
  const [trial, setTrial] = useState('');
  const [grace, setGrace] = useState('');
  const [pix, setPix] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    setFee(String(initial.saasMonthlyFee ?? 0).replace('.', ','));
    setTrial(String(initial.saasTrialDays ?? 14));
    setGrace(String(initial.saasGraceDays ?? 5));
    setPix(!!initial.directTransfersEnabled);
  }, [initial.saasMonthlyFee, initial.saasTrialDays, initial.saasGraceDays, initial.directTransfersEnabled]);

  const save = async () => {
    // parseAmount: só dígitos com até 2 casas ("1e3", "1.999", sinal e vazio são recusados); 0 vale.
    const feeN = parseAmount(fee.trim());
    const trialN = Number(trial);
    const graceN = Number(grace);
    if (feeN === null) {
      setMsg({ tone: 'error', text: 'Valor padrão inválido: use só números, com até 2 casas (ex.: 49,90).' });
      return;
    }
    if (!Number.isInteger(trialN) || trialN < 0 || trialN > 365) {
      setMsg({ tone: 'error', text: 'Dias de teste: inteiro de 0 a 365.' });
      return;
    }
    if (!Number.isInteger(graceN) || graceN < 0 || graceN > 60) {
      setMsg({ tone: 'error', text: 'Dias de tolerância: inteiro de 0 a 60.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const r = await api.put('/admin/switches', {
        saasMonthlyFee: feeN, saasTrialDays: trialN, saasGraceDays: graceN, directTransfersEnabled: pix,
      });
      onSaved(r.data);
      setMsg({ tone: 'success', text: 'Mensalidade salva.' });
    } catch (err) {
      setMsg({ tone: 'error', text: adminErrorMessage(err, 'Erro ao salvar.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>Mensalidade SaaS</h2>
        <span className={styles.badge}>Só o CEO</span>
      </div>
      <p className={styles.desc}>Cobrança mensal das lojas no modo direto. O valor especial de cada loja fica em Lojas · Asaas e mensalidades.</p>
      <div className={styles.fields}>
        <Input label="Valor padrão (R$)" value={fee} onChange={setFee} inputMode="decimal" />
        <Input label="Dias de teste" value={trial} onChange={setTrial} inputMode="numeric" />
        <Input label="Dias de tolerância" value={grace} onChange={setGrace} inputMode="numeric" />
      </div>
      <Checkbox label="Pix automático ao motoboy" checked={pix} onChange={setPix} />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className={styles.actions}>
        <Button onClick={save} loading={saving}>Salvar mensalidade</Button>
      </div>
    </section>
  );
}

export default SaasFeeCard;
