/**
 * Reatribuir motoboy (D3b-1, spec 4.3 e 5.2). Só aparece com 'reassign' em allowedActions (entrega 'assigned' e a
 * permissão order:reassign, já descontadas pelo servidor). Motivo obrigatório (5 a 500 sem os espaços das pontas).
 * Não pune o motoboy. 409 (DELIVERY_CHANGED, DELIVERY_NOT_REASSIGNABLE): a mensagem aparece na folha e a tela relê
 * o pedido.
 */
import { useEffect, useState } from 'react';
import { AdminSheet } from '../AdminSheet';
import blocks from '../AdminBlocks.module.css';
import { TextAreaField } from '../dinheiro/TextAreaField';
import { ADMIN_REASON_MAX, ADMIN_REASON_MIN } from './CancelOrderSheet';
import { Alert } from '../../ui/Alert';
import { adminReassign, flattenOpsError, isOpsConflict } from '../../../lib/adminOps';

export interface ReassignSheetProps {
  open: boolean;
  orderId: string;
  motoboyName: string;
  onClose: () => void;
  onReassigned: () => void | Promise<void>;
  /** 409: a entrega mudou (ex.: o motoboy retirou); a tela relê e a folha fica aberta com a mensagem. */
  onStale: () => void;
}

export function ReassignSheet({ open, orderId, motoboyName, onClose, onReassigned, onStale }: ReassignSheetProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const reasonLen = reason.trim().length;
  const valid = reasonLen >= ADMIN_REASON_MIN && reasonLen <= ADMIN_REASON_MAX;

  const submit = async () => {
    if (!valid) return;
    try {
      await adminReassign(orderId, reason.trim());
    } catch (err) {
      if (isOpsConflict(err)) onStale();
      throw flattenOpsError(err, 'Não deu para reatribuir o motoboy.');
    }
    await onReassigned();
  };

  return (
    <AdminSheet
      open={open}
      title="Reatribuir motoboy"
      onClose={onClose}
      secondaryLabel="Voltar"
      primary={{ label: 'Confirmar reatribuição', tone: 'danger', disabled: !valid, onClick: submit }}
    >
      <Alert tone="warning">{`A corrida volta para a fila; ${motoboyName} não recebe esta corrida de novo`}</Alert>
      <p className={blocks.muted}>Sem punição: não conta como recusa nem como cancelamento do motoboy.</p>
      <TextAreaField
        label={`Motivo (de ${ADMIN_REASON_MIN} a ${ADMIN_REASON_MAX} caracteres)`}
        value={reason}
        onChange={setReason}
        placeholder="Ex.: motoboy parado há 25 min sem ir até a loja"
        hint={`${reasonLen}/${ADMIN_REASON_MAX}. Fica na linha do tempo do pedido com o seu nome.`}
      />
    </AdminSheet>
  );
}

export default ReassignSheet;
