/**
 * Resolver saque incerto (tela 29). Mesma chamada e mesmas validações da página antiga:
 * POST /withdrawals/:id/resolve-uncertain { outcome: 'paid' | 'not_sent', note, asaasTransferId? }.
 * 409 WITHDRAWAL_NOT_RESOLVABLE (outra pessoa resolveu antes) NÃO é sucesso: a folha mostra o erro, não fecha,
 * e a tela relê a lista (onStale). Um ref impede dois POSTs no mesmo clique duplo.
 */
import { useEffect, useRef, useState } from 'react';
import { AdminSheet } from '../AdminSheet';
import blocks from '../AdminBlocks.module.css';
import ui from './Dinheiro.module.css';
import { TextAreaField } from './TextAreaField';
import { flattenServerError } from './serverError';
import type { Withdrawal } from './withdrawalRules';
import { Alert } from '../../ui/Alert';
import { Input } from '../../ui/Input';
import { RadioRow } from '../../ui/RadioRow';
import api from '../../../lib/api';
import { isConflictWithCode } from '../../../lib/adminErrors';
import { formatMoney } from '../../../lib/money';

export type ResolveOutcome = 'paid' | 'not_sent';
export const STALE_RESOLVE_MESSAGE = 'Este saque já foi resolvido (ou não está mais incerto). A lista foi atualizada.';

export interface ResolveUncertainSheetProps {
  withdrawal: Withdrawal | null;
  onClose: () => void;
  onResolved: (outcome: ResolveOutcome) => void | Promise<void>;
  onStale: () => void;
}

export function ResolveUncertainSheet({ withdrawal, onClose, onResolved, onStale }: ResolveUncertainSheetProps) {
  const [outcome, setOutcome] = useState<'' | ResolveOutcome>('');
  const [transferId, setTransferId] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  // Trava síncrona contra clique duplo: vale antes de qualquer setState, ao contrário do `busy` da folha.
  const inFlight = useRef(false);

  useEffect(() => {
    setOutcome('');
    setTransferId('');
    setNote('');
    setFormError(null);
  }, [withdrawal?._id]);

  const submit = async () => {
    if (!withdrawal || inFlight.current) return;
    if (!outcome) { setFormError('Escolha o que o painel do Asaas mostra.'); return; }
    if (note.trim().length < 10) { setFormError('Escreva uma nota com pelo menos 10 caracteres.'); return; }
    setFormError(null);
    inFlight.current = true;
    const body: { outcome: ResolveOutcome; note: string; asaasTransferId?: string } = { outcome, note: note.trim() };
    if (outcome === 'paid' && transferId.trim()) body.asaasTransferId = transferId.trim();
    try {
      await api.post(`/withdrawals/${withdrawal._id}/resolve-uncertain`, body);
    } catch (err) {
      if (isConflictWithCode(err, 'WITHDRAWAL_NOT_RESOLVABLE')) {
        onStale();
        throw { response: { status: 409, data: { error: STALE_RESOLVE_MESSAGE } } };
      }
      throw flattenServerError(err, 'Erro ao resolver o saque');
    } finally {
      inFlight.current = false;
    }
    await onResolved(outcome);
  };

  const money = withdrawal ? formatMoney(Number(withdrawal.amount)) : '';

  return (
    <AdminSheet
      open={!!withdrawal}
      title="Resolver saque incerto"
      onClose={onClose}
      primary={{ label: 'Confirmar resolução', onClick: submit }}
    >
      {withdrawal && (
        <>
          <p className={blocks.muted}>
            {`${withdrawal.motoboyName || 'Recebedor'} · ${money}.`} O Asaas não respondeu e o Pix pode ter saído.
          </p>
          <Alert tone="info" title="Confira antes de escolher">
            {`Painel do Asaas → Transferências → procure ${money} para esta pessoa.`}
          </Alert>
          <fieldset className={ui.fieldset}>
            <legend className={ui.fieldLabel}>O que o painel do Asaas mostra?</legend>
            <RadioRow
              name="resolve-outcome"
              value="paid"
              checked={outcome === 'paid'}
              onChange={() => setOutcome('paid')}
              label="O Pix saiu (concluir o saque)"
            />
            <RadioRow
              name="resolve-outcome"
              value="not_sent"
              checked={outcome === 'not_sent'}
              onChange={() => setOutcome('not_sent')}
              label="O Pix não saiu (voltar para pendente)"
            />
          </fieldset>
          {outcome === 'paid' && (
            <Input
              label="Id da transferência no Asaas (opcional)"
              aria-label="Id da transferência no Asaas"
              value={transferId}
              onChange={setTransferId}
              placeholder="tra_000000000000"
            />
          )}
          <TextAreaField
            label="Nota da conferência"
            value={note}
            onChange={setNote}
            placeholder="O que você conferiu no painel do Asaas"
            hint="Mínimo de 10 caracteres. Fica no registro do saque."
          />
          {formError && <p role="alert" className={ui.formError}>{formError}</p>}
        </>
      )}
    </AdminSheet>
  );
}

export default ResolveUncertainSheet;
