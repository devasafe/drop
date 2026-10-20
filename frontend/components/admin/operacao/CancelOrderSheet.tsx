/**
 * Cancelar com estorno (D3b-1, spec 4.2 e 5.1). Só aparece com 'cancel' em allowedActions (o servidor já descontou
 * a permissão order:admin_cancel e o status).
 * - culpa em rádio (Cliente / Loja / Motoboy / Ninguém (problema do DROP)), sem padrão: o admin escolhe;
 * - prévia de GET /admin/orders/:id/cancel-preview?fault=, relida a cada troca de culpa (só a última vale);
 * - motivo obrigatório, de 5 a 500 caracteres sem contar os espaços das pontas;
 * - confirmar só com culpa, prévia dessa mesma culpa e motivo válido;
 * - 409 (ORDER_CHANGED, ORDER_NOT_CANCELLABLE): a mensagem aparece na folha e a tela relê o pedido;
 * - pedido relido com outro estado (`orderVersion`) com a folha aberta: a prévia da culpa marcada é refeita, porque o
 *   servidor recalcula taxa e compensação pelo estado novo; o confirmar desliga até ela chegar;
 * - com culpa do cliente (ou da loja na custódia) a compensação do motoboy sai DE DENTRO da taxa, não soma a ela.
 * A culpa nunca chega ao cliente (spec 4.2, avisos): a folha lembra isso ao admin.
 */
import { useEffect, useRef, useState } from 'react';
import { AdminSheet } from '../AdminSheet';
import blocks from '../AdminBlocks.module.css';
import { LoadSkeleton } from '../LoadState';
import { TextAreaField } from '../dinheiro/TextAreaField';
import ui from './Operacao.module.css';
import { Button } from '../../ui/Button';
import { RadioRow } from '../../ui/RadioRow';
import {
  CANCEL_FAULTS, COUNTS_AGAINST_LABEL, FAULT_LABEL, FEE_FROM_LABEL, PAYER_LABEL, adminCancelOrder, fetchCancelPreview,
  flattenOpsError, isOpsConflict, isUnpaidPreview, opsErrorMessage, type CancelFault, type CancelPreview, type CancelResult,
} from '../../../lib/adminOps';
import { formatMoney } from '../../../lib/money';

export const ADMIN_REASON_MIN = 5;
export const ADMIN_REASON_MAX = 500;

export interface CancelOrderSheetProps {
  open: boolean;
  orderId: string;
  /** "#a1b2c3" (título da folha). */
  orderLabel: string;
  /** Muda quando o estado do pedido muda (ex.: `${status}|${deliveryStatus}|${motoboyId}`): refaz a prévia. */
  orderVersion: string;
  onClose: () => void;
  onCancelled: (r: CancelResult) => void | Promise<void>;
  /** 409: o pedido mudou enquanto a folha estava aberta; a tela relê (a folha fica aberta com a mensagem). */
  onStale: () => void;
}

export function CancelOrderSheet({ open, orderId, orderLabel, orderVersion, onClose, onCancelled, onStale }: CancelOrderSheetProps) {
  const [fault, setFault] = useState<CancelFault | null>(null);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<CancelPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // POST em andamento: culpa e motivo travados (a AdminSheet já trava o botão).
  const [sending, setSending] = useState(false);
  // Só a prévia da última culpa escolhida vale (troca rápida de culpa).
  const previewReq = useRef(0);

  // Abrir zera tudo; a culpa nunca vem marcada.
  useEffect(() => {
    if (!open) return;
    previewReq.current += 1;
    setFault(null);
    setReason('');
    setPreview(null);
    setPreviewError(null);
  }, [open]);

  const loadPreview = async (f: CancelFault) => {
    const n = ++previewReq.current;
    setPreview(null);
    setPreviewError(null);
    try {
      const p = await fetchCancelPreview(orderId, f);
      if (n === previewReq.current) setPreview(p);
    } catch (err) {
      if (n !== previewReq.current) return;
      setPreviewError(opsErrorMessage(err, 'Não deu para calcular a prévia.'));
      if (isOpsConflict(err)) onStale();
    }
  };

  // Pedido relido com outro estado: a prévia mostrada pode não valer mais.
  const seenVersion = useRef(orderVersion);
  useEffect(() => {
    if (seenVersion.current === orderVersion) return;
    seenVersion.current = orderVersion;
    if (open && fault) void loadPreview(fault);
    // Só a troca de versão dispara; open e fault são lidos do render atual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderVersion]);

  const pick = (f: CancelFault) => {
    setFault(f);
    void loadPreview(f);
  };

  const reasonLen = reason.trim().length;
  const valid = !!fault && !!preview && preview.fault === fault
    && reasonLen >= ADMIN_REASON_MIN && reasonLen <= ADMIN_REASON_MAX;

  const submit = async () => {
    if (!fault || !valid) return;
    let result: CancelResult;
    setSending(true);
    try {
      result = await adminCancelOrder(orderId, fault, reason.trim());
    } catch (err) {
      if (isOpsConflict(err)) onStale();
      throw flattenOpsError(err, 'Não deu para cancelar o pedido.');
    } finally {
      setSending(false);
    }
    await onCancelled(result);
  };

  return (
    <AdminSheet
      open={open}
      title={`Cancelar ${orderLabel}`}
      onClose={onClose}
      secondaryLabel="Voltar"
      primary={{ label: 'Confirmar cancelamento', tone: 'danger', disabled: !valid, onClick: submit }}
    >
      <fieldset className={ui.fieldset}>
        <legend className={ui.fieldLabel}>De quem é a culpa?</legend>
        {CANCEL_FAULTS.map((f) => (
          <RadioRow
            key={f}
            name="admin-cancel-fault"
            value={f}
            checked={fault === f}
            onChange={() => pick(f)}
            label={FAULT_LABEL[f]}
            disabled={sending}
          />
        ))}
      </fieldset>

      <section className={ui.preview} aria-label="O que vai acontecer" aria-live="polite">
        {!fault ? (
          <p className={blocks.muted}>Escolha a culpa para ver o que acontece com o dinheiro.</p>
        ) : previewError ? (
          <div className={ui.rowError}>
            <span role="alert">{previewError}</span>
            <Button variant="tertiary" size="sm" onClick={() => { void loadPreview(fault); }}>Tentar de novo</Button>
          </div>
        ) : !preview ? (
          <LoadSkeleton lines={3} />
        ) : (
          <PreviewFacts p={preview} />
        )}
      </section>

      <TextAreaField
        label={`Motivo (de ${ADMIN_REASON_MIN} a ${ADMIN_REASON_MAX} caracteres)`}
        value={reason}
        onChange={setReason}
        placeholder="Ex.: a loja fechou sem avisar e o cliente pediu para cancelar"
        hint={`${reasonLen}/${ADMIN_REASON_MAX}. Fica na linha do tempo do pedido com o seu nome.`}
        disabled={sending}
      />
      <p className={blocks.muted}>O cliente não vê a culpa: recebe só o aviso de cancelamento pelo suporte do DROP.</p>
    </AdminSheet>
  );
}

function PreviewFacts({ p }: { p: CancelPreview }) {
  // Com taxa cobrada do próprio culpado, a compensação é parte dela: "sai da taxa", para não parecer soma.
  const fromFee = p.feeCharged > 0 && p.compensationPaidBy === p.fault;
  const payer = fromFee
    ? ` · sai da taxa ${FEE_FROM_LABEL[p.fault]}`
    : p.compensationPaidBy ? ` · paga ${PAYER_LABEL[p.compensationPaidBy]}` : '';
  return (
    <dl className={ui.facts}>
      <div>
        <dt>Cliente recebe de volta</dt>
        <dd>{isUnpaidPreview(p) ? 'Nada a devolver: o pedido não foi pago' : formatMoney(p.customerRefund)}</dd>
      </div>
      {p.feeCharged > 0 && (
        <div><dt>{`Taxa cobrada ${FEE_FROM_LABEL[p.fault]}`}</dt><dd>{formatMoney(p.feeCharged)}</dd></div>
      )}
      <div>
        <dt>Compensação do motoboy</dt>
        <dd>{p.motoboyCompensation > 0 ? `${formatMoney(p.motoboyCompensation)}${payer}` : 'Nenhuma'}</dd>
      </div>
      <div>
        <dt>Conta como cancelamento</dt>
        <dd>{p.countsAgainst ? COUNTS_AGAINST_LABEL[p.countsAgainst] : 'Não conta para ninguém'}</dd>
      </div>
    </dl>
  );
}

export default CancelOrderSheet;
