/**
 * Confirmação com motivo (D3b-2a): bloquear, desbloquear, perdoar dívida, pausar e liberar loja.
 * - `required`: motivo de 5 a 500 caracteres sem contar os espaços das pontas (o servidor confere de novo e
 *   responde 400 REASON_REQUIRED); sem `required`, o motivo é opcional e vai '' quando ninguém escreveu.
 * - Erro do `onConfirm` (cru ou já achatado) aparece dentro da folha em português (flattenAccountError); ela continua aberta; quem fecha no sucesso é a tela.
 * - Abrir de novo começa sem motivo (a mesma folha serve a várias dívidas).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { AdminSheet } from '../AdminSheet';
import { TextAreaField } from '../dinheiro/TextAreaField';
import { REASON_MAX, REASON_MIN, flattenAccountError, reasonIsValid } from '../../../lib/adminAccounts';
import ui from './Accounts.module.css';

export interface ReasonSheetProps {
  open: boolean;
  title: string;
  /** O que vai acontecer (no perdão, com o valor bem visível). */
  description: ReactNode;
  confirmLabel: string;
  required: boolean;
  /** Recebe o motivo já aparado. Pode devolver Promise; o erro aparece na folha. */
  onConfirm: (reason: string) => void | Promise<void>;
  onClose: () => void;
  /** Botão vermelho para bloquear e pausar. */
  tone?: 'danger' | 'default';
}

export function ReasonSheet({
  open, title, description, confirmLabel, required, onConfirm, onClose, tone = 'default',
}: ReasonSheetProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const text = reason.trim();
  const valid = required ? reasonIsValid(text) : text.length <= REASON_MAX;

  /** A AdminSheet mostra `data.error`: o erro cru do servidor sai daqui já em português, com status e código. */
  const confirm = async () => {
    try {
      await onConfirm(text);
    } catch (err) {
      throw flattenAccountError(err);
    }
  };

  return (
    <AdminSheet
      open={open}
      title={title}
      onClose={onClose}
      primary={{ label: confirmLabel, tone, disabled: !valid, onClick: confirm }}
    >
      <div className={ui.sheetText}>{description}</div>
      <TextAreaField
        label={required ? 'Motivo (obrigatório)' : 'Motivo (opcional)'}
        value={reason}
        onChange={setReason}
        rows={3}
        hint={required
          ? `De ${REASON_MIN} a ${REASON_MAX} caracteres. Fica no histórico da ficha.`
          : `Até ${REASON_MAX} caracteres. Fica no histórico da ficha.`}
      />
    </AdminSheet>
  );
}

export default ReasonSheet;
