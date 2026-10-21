/**
 * Mensalidade na ficha da loja (D3b-2b, spec 9):
 * - estender o teste: 7, 14 ou 30 dias, cada um com a data nova, e o motivo;
 * - cancelar a mensalidade: o motivo e o nome da loja digitado para liberar o botão.
 * O erro do servidor aparece dentro da folha em português (flattenAccountError); quem fecha no sucesso é a tela.
 */
import { useEffect, useState } from 'react';
import { AdminSheet } from '../AdminSheet';
import { TextAreaField } from '../dinheiro/TextAreaField';
import { Input } from '../../ui/Input';
import { RadioRow } from '../../ui/RadioRow';
import {
  REASON_MAX, REASON_MIN, TRIAL_DAYS, flattenAccountError, reasonIsValid, spDate, storeNameMatches, trialEndPreview,
  type TrialDays,
} from '../../../lib/adminAccounts';
import ui from './Accounts.module.css';

const REASON_HINT = `De ${REASON_MIN} a ${REASON_MAX} caracteres. Fica no histórico da ficha.`;

export interface ExtendTrialSheetProps {
  open: boolean;
  storeName: string;
  trialEndsAt: string | null;
  onConfirm: (days: TrialDays, reason: string) => Promise<void>;
  onClose: () => void;
}

export function ExtendTrialSheet({ open, storeName, trialEndsAt, onConfirm, onClose }: ExtendTrialSheetProps) {
  const [days, setDays] = useState<TrialDays | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setDays(null);
      setReason('');
    }
  }, [open]);

  const text = reason.trim();
  const confirm = async () => {
    if (days === null) return;
    try {
      await onConfirm(days, text);
    } catch (err) {
      throw flattenAccountError(err);
    }
  };
  const now = trialEndsAt ? `O teste vai até ${spDate(trialEndsAt)}.` : 'A loja está em teste.';

  return (
    <AdminSheet
      open={open}
      title="Estender teste"
      onClose={onClose}
      primary={{ label: 'Estender teste', disabled: days === null || !reasonIsValid(text), onClick: confirm }}
    >
      <div className={ui.sheetText}>
        <p>{storeName}</p>
        <p>{`${now} Os dias contam a partir do fim do teste (ou de hoje, se ele já acabou).`}</p>
      </div>
      <div role="radiogroup" aria-label="Quantos dias a mais" className={ui.stack}>
        {TRIAL_DAYS.map((d) => (
          <RadioRow
            key={d}
            name="dias-de-teste"
            value={String(d)}
            checked={days === d}
            onChange={() => setDays(d)}
            label={`${d} dias`}
            description={`Teste até ${trialEndPreview(trialEndsAt, d)}`}
          />
        ))}
      </div>
      <TextAreaField label="Motivo (obrigatório)" value={reason} onChange={setReason} rows={3} hint={REASON_HINT} />
    </AdminSheet>
  );
}

export interface CancelSaasSheetProps {
  open: boolean;
  storeName: string;
  /** Fim do período pago (ou do teste): até quando a loja vende (saasCoverageEnd). */
  coverageEnd: string | null;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

export function CancelSaasSheet({ open, storeName, coverageEnd, onConfirm, onClose }: CancelSaasSheetProps) {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (open) {
      setReason('');
      setTyped('');
    }
  }, [open]);

  const text = reason.trim();
  const ready = reasonIsValid(text) && storeNameMatches(typed, storeName);
  const confirm = async () => {
    try {
      await onConfirm(text);
    } catch (err) {
      throw flattenAccountError(err);
    }
  };
  const end = coverageEnd ? Date.parse(coverageEnd) : NaN;
  const until = Number.isFinite(end) && end > Date.now() ? spDate(coverageEnd as string) : null;

  return (
    <AdminSheet
      open={open}
      title="Cancelar mensalidade"
      onClose={onClose}
      secondaryLabel="Voltar"
      primary={{ label: 'Cancelar mensalidade', tone: 'danger', disabled: !ready, onClick: confirm }}
    >
      <div className={ui.sheetText}>
        <p>{storeName}</p>
        <p>A cobrança para no Asaas agora.</p>
        <p>
          {until
            ? `A loja continua vendendo até ${until} e depois fica pausada pelo DROP com o motivo “Mensalidade cancelada”.`
            : 'O período pago já acabou: a loja fica pausada pelo DROP com o motivo “Mensalidade cancelada” na próxima verificação automática.'}
        </p>
        <p>Depois da pausa, só o DROP libera a loja.</p>
      </div>
      <TextAreaField label="Motivo (obrigatório)" value={reason} onChange={setReason} rows={3} hint={REASON_HINT} />
      <Input
        label="Digite o nome da loja para confirmar"
        value={typed}
        onChange={setTyped}
        placeholder={storeName}
        hint={`Digite: ${storeName}`}
      />
    </AdminSheet>
  );
}
