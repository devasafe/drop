/**
 * Resolver repasse incerto (D3b-3, spec 4.1 e 9): POST /payouts/admin/:id/resolve-uncertain
 * { outcome: 'released', asaasTransferId?, note } | { outcome: 'not_sent', note } (payout:release).
 * "Foi pago" conclui o repasse; "Não foi enviado" volta para "Aguardando liberação". Nota de 10 a 1000 caracteres;
 * nº da transferência opcional (até 100), só com "Foi pago".
 * Se o Asaas devolveu um id de transferência (gatewayTransferId real, não o sintético manual_resolve_*), a folha
 * avisa forte: o dinheiro provavelmente saiu, conferir antes de marcar "Não foi enviado" (ruling da Task 4).
 * 409 PAYOUT_NOT_RESOLVABLE (outra pessoa resolveu antes) não é sucesso: a folha mostra o aviso, não fecha,
 * e a tela relê a lista (onStale). Um ref impede dois POSTs no mesmo clique duplo.
 */
import { useEffect, useRef, useState } from 'react';
import { AdminSheet } from '../AdminSheet';
import blocks from '../AdminBlocks.module.css';
import ui from './Dinheiro.module.css';
import { TextAreaField } from './TextAreaField';
import { flattenMoneyError } from './moneyErrors';
import { isManualResolveId, recipientName, type Payout } from './payoutRules';
import { Alert } from '../../ui/Alert';
import { Input } from '../../ui/Input';
import { RadioRow } from '../../ui/RadioRow';
import api from '../../../lib/api';
import { isConflictWithCode } from '../../../lib/adminErrors';
import { formatMoney } from '../../../lib/money';

export type PayoutResolveOutcome = 'released' | 'not_sent';
export const STALE_PAYOUT_RESOLVE_MESSAGE = 'Este repasse já foi resolvido (ou não está mais incerto). A lista foi atualizada.';

const NOTE_MIN = 10;
const NOTE_MAX = 1000;
const TRANSFER_MAX = 100;

export interface ResolvePayoutSheetProps {
  payout: Payout | null;
  onClose: () => void;
  onResolved: (outcome: PayoutResolveOutcome) => void | Promise<void>;
  onStale: () => void;
}

export function ResolvePayoutSheet({ payout, onClose, onResolved, onStale }: ResolvePayoutSheetProps) {
  const [outcome, setOutcome] = useState<'' | PayoutResolveOutcome>('');
  const [transferId, setTransferId] = useState('');
  const [note, setNote] = useState('');
  // Trava síncrona contra clique duplo: vale antes de qualquer setState, ao contrário do `busy` da folha.
  const inFlight = useRef(false);

  useEffect(() => {
    setOutcome('');
    setTransferId('');
    setNote('');
  }, [payout?._id]);

  const noteLen = note.trim().length;
  const tid = transferId.trim();
  const valid = outcome !== '' && noteLen >= NOTE_MIN && noteLen <= NOTE_MAX
    && (outcome !== 'released' || tid.length <= TRANSFER_MAX);

  const submit = async () => {
    if (!payout || !valid || inFlight.current) return; // valid já exige outcome escolhido
    inFlight.current = true;
    const body = outcome === 'released'
      ? { outcome, note: note.trim(), ...(tid ? { asaasTransferId: tid } : {}) }
      : { outcome, note: note.trim() };
    try {
      await api.post(`/payouts/admin/${payout._id}/resolve-uncertain`, body);
    } catch (err) {
      if (isConflictWithCode(err, 'PAYOUT_NOT_RESOLVABLE')) {
        onStale();
        throw { response: { status: 409, data: { error: STALE_PAYOUT_RESOLVE_MESSAGE } } };
      }
      throw flattenMoneyError(err, 'Erro ao resolver o repasse');
    } finally {
      inFlight.current = false;
    }
    await onResolved(outcome);
  };

  const money = payout ? formatMoney(Number(payout.amount)) : '';
  const who = payout ? recipientName(payout) : '';
  const asaasId = payout?.gatewayTransferId && !isManualResolveId(payout.gatewayTransferId) ? payout.gatewayTransferId : null;

  return (
    <AdminSheet
      open={!!payout}
      title="Resolver repasse incerto"
      onClose={onClose}
      primary={{ label: 'Confirmar resolução', disabled: !valid, onClick: submit }}
    >
      {payout && (
        <>
          <p className={blocks.muted}>
            {`${who} · ${money}. A transferência começou e o Asaas não confirmou: o dinheiro pode ter saído.`}
          </p>
          <Alert tone="info" title="Confira antes de escolher">
            {`Painel do Asaas → Transferências → procure ${money} para ${who}.`}
          </Alert>
          {asaasId && (
            <Alert tone="warning" title="O dinheiro pode ter saído">
              {`O Asaas devolveu o id ${asaasId}: confira no Asaas se a transferência falhou antes de marcar "Não foi enviado".`}
            </Alert>
          )}
          <fieldset className={ui.fieldset}>
            <legend className={ui.fieldLabel}>O que o painel do Asaas mostra?</legend>
            <RadioRow
              name="payout-resolve"
              value="released"
              checked={outcome === 'released'}
              onChange={() => setOutcome('released')}
              label="Foi pago"
              description="Conclui o repasse; o valor fica disponível para saque."
            />
            <RadioRow
              name="payout-resolve"
              value="not_sent"
              checked={outcome === 'not_sent'}
              onChange={() => setOutcome('not_sent')}
              label="Não foi enviado"
              description='Volta para "Aguardando liberação".'
            />
          </fieldset>
          {outcome === 'released' && (
            <Input
              label="Nº da transferência no Asaas (opcional)"
              value={transferId}
              onChange={setTransferId}
              placeholder="tra_000000000000"
              error={tid.length > TRANSFER_MAX ? 'No máximo 100 caracteres.' : undefined}
            />
          )}
          <TextAreaField
            label="Nota da conferência"
            value={note}
            onChange={setNote}
            placeholder="O que você conferiu no painel do Asaas"
            hint={`De 10 a 1000 caracteres (${noteLen}/1000). Fica no registro do repasse.`}
          />
        </>
      )}
    </AdminSheet>
  );
}

export default ResolvePayoutSheet;
