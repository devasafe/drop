import React, { useState, useEffect } from 'react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { RadioRow } from '../ui/RadioRow';
import useCancellation from '@/hooks/useCancellation';
import { useSocket } from '@/contexts/SocketContext';
import styles from './RejectDeliveryModal.module.css';

interface RejectDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  deliveryId: string;
  deliveryStatus: string;
  onSuccess?: () => void;
}

const REJECTION_REASONS = [
  { code: 'delivery_failed', label: 'Impossível entregar', description: 'Não consigo chegar ao local' },
  { code: 'customer_unreachable', label: 'Cliente não disponível', description: 'Cliente não atende' },
  { code: 'address_invalid', label: 'Endereço inválido', description: 'Endereço incorreto ou não encontrado' },
  { code: 'motoboy_unavailable', label: 'Indisponível para continuar', description: 'Problema pessoal ou técnico' },
  { code: 'other', label: 'Outro motivo', description: 'Outro motivo não listado' },
];

export function RejectDeliveryModal({
  isOpen,
  onClose,
  deliveryId,
  deliveryStatus,
  onSuccess,
}: RejectDeliveryModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>('delivery_failed');
  const [customReason, setCustomReason] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<'reassign' | 'cancel'>('reassign');
  const [step, setStep] = useState<'reason' | 'action' | 'confirm' | 'waiting'>('reason');
  const [waitingMessage, setWaitingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const { rejectDelivery, loading } = useCancellation();
  const { on } = useSocket();

  const canReject = ['assigned', 'picked'].includes(deliveryStatus);
  const requiresReturnPin = deliveryStatus === 'picked';

  const clearError = () => setError(null);

  const handleNext = () => {
    clearError();
    if (step === 'reason') {
      const reason = selectedReason === 'other' ? customReason : selectedReason;
      if (!reason.trim()) {
        setError('Por favor, especifique um motivo.');
        return;
      }
      setStep('action');
    } else if (step === 'action') {
      setStep('confirm');
    }
  };

  const handleBack = () => {
    clearError();
    if (step === 'action') setStep('reason');
    else if (step === 'confirm') setStep('action');
  };

  const handleConfirm = async () => {
    clearError();
    let reason = '';
    if (selectedReason === 'other') {
      reason = customReason;
    } else {
      const selectedOption = REJECTION_REASONS.find((r) => r.code === selectedReason);
      reason = selectedOption ? selectedOption.description : selectedReason;
    }

    const result = await rejectDelivery(deliveryId, reason, selectedAction, selectedReason);

    if (result.success) {
      if (result.isPending) {
        const pinDisplay = result.data?.pinDevolucao || result.pinDevolucao || 'Aguarde...';
        setWaitingMessage(pinDisplay);
        setStep('waiting');
      } else {
        if (onSuccess) onSuccess();
        onClose();
      }
    } else {
      setError(result.error || 'Erro ao processar rejeição.');
    }
  };

  useEffect(() => {
    if (!isOpen || step !== 'waiting') return;
    const unsubscribe = on('delivery:return_confirmed', (data: any) => {
      if (data.deliveryId === deliveryId) {
        setWaitingMessage('Devolução confirmada pela loja!');
        setTimeout(() => {
          if (onSuccess) onSuccess();
          onClose();
        }, 2000);
      }
    });
    return () => unsubscribe();
  }, [isOpen, step, deliveryId, on, onClose, onSuccess]);

  if (!canReject && step !== 'waiting') {
    return (
      <Sheet open={isOpen} onClose={onClose} title="Rejeitar entrega">
        <p className={styles.intro}>
          Esta entrega está num estágio onde não é mais possível rejeitá-la ({deliveryStatus}).
        </p>
        <div className={styles.actions}>
          <Button variant="primary" onClick={onClose}>Fechar</Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={isOpen} onClose={onClose} title="Rejeitar entrega">
      {/* Passo 1 — motivo */}
      {step === 'reason' && (
        <>
          <p className={styles.intro}>Por que você quer rejeitar esta entrega?</p>
          <div className={styles.options}>
            {REJECTION_REASONS.map((option) => (
              <RadioRow
                key={option.code}
                name="reject-reason"
                value={option.code}
                checked={selectedReason === option.code}
                onChange={(v) => { setSelectedReason(v); clearError(); }}
                label={option.label}
                description={option.description}
              />
            ))}
          </div>

          {selectedReason === 'other' && (
            <div className={styles.textareaWrap}>
              <textarea
                className={styles.textarea}
                placeholder="Descreva o motivo..."
                value={customReason}
                onChange={(e) => { setCustomReason(e.target.value); clearError(); }}
                maxLength={200}
              />
              <p className={styles.charCount}>{customReason.length}/200</p>
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <Button variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button variant="primary" onClick={handleNext} disabled={loading}>Próximo</Button>
          </div>
        </>
      )}

      {/* Passo 2 — ação */}
      {step === 'action' && (
        <>
          <p className={styles.intro}>O que deseja fazer com esta entrega?</p>
          <div className={styles.options}>
            <RadioRow
              name="action"
              value="reassign"
              checked={selectedAction === 'reassign'}
              onChange={() => setSelectedAction('reassign')}
              label="Devolver ao pool"
              description={
                requiresReturnPin
                  ? 'O produto já foi retirado. Você precisará devolvê-lo à loja com um PIN. Após a confirmação, outro motoboy será atribuído. O cliente não será reembolsado.'
                  : 'A entrega volta para a fila e outro motoboy pode reivindicá-la. Você não ganha os pontos.'
              }
            />
            <RadioRow
              name="action"
              value="cancel"
              tone="danger"
              checked={selectedAction === 'cancel'}
              onChange={() => setSelectedAction('cancel')}
              label="Cancelar entrega"
              description={
                requiresReturnPin
                  ? 'A entrega é cancelada. Como o produto já foi retirado, você deverá devolvê-lo na loja usando um PIN de confirmação.'
                  : 'A entrega é cancelada completamente. O cliente recebe reembolso imediato. Use apenas em último caso.'
              }
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <Button variant="ghost" onClick={handleBack} disabled={loading}>Voltar</Button>
            <Button variant="primary" onClick={handleNext} disabled={loading}>Próximo</Button>
          </div>
        </>
      )}

      {/* Passo 3 — confirmação */}
      {step === 'confirm' && (
        <>
          <div className={styles.summary}>
            <h4 className={styles.summaryTitle}>Resumo da rejeição</h4>
            <div className={styles.summaryRow}>
              <span className={styles.summaryKey}>Motivo:</span>
              <span>{REJECTION_REASONS.find((r) => r.code === selectedReason)?.label || customReason}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryKey}>Ação:</span>
              <span>{selectedAction === 'reassign' ? 'Devolver ao pool' : 'Cancelar entrega'}</span>
            </div>
          </div>

          {requiresReturnPin && (
            <div className={styles.info}>
              Como o produto já foi retirado, você precisará devolvê-lo na loja com um PIN de confirmação.
              {selectedAction === 'cancel'
                ? ' O cliente será reembolsado após a confirmação.'
                : ' Após a confirmação, outro motoboy será atribuído.'}
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <Button variant="ghost" onClick={handleBack} disabled={loading}>Voltar</Button>
            <Button
              variant={selectedAction === 'cancel' ? 'danger' : 'primary'}
              onClick={handleConfirm}
              loading={loading}
            >
              {selectedAction === 'reassign' ? 'Devolver entrega' : 'Cancelar entrega'}
            </Button>
          </div>
        </>
      )}

      {/* Passo 4 — aguardando confirmação da loja */}
      {step === 'waiting' && (
        <div className={styles.waiting}>
          <div className={styles.spinner} aria-hidden="true" />
          <h4 className={styles.waitingTitle}>Aguardando confirmação da loja</h4>

          <div className={styles.pinBox}>
            <p className={styles.pinLabel}>Seu PIN de devolução</p>
            <p className={styles.pinValue}>{waitingMessage}</p>
            <p className={styles.pinHint}>Anote este PIN e leve para a loja</p>
          </div>

          <div className={styles.steps}>
            <p className={styles.stepsTitle}>Próximos passos</p>
            <ul className={styles.stepsList}>
              <li>Guarde o PIN acima com você</li>
              <li>Vá até a loja com o produto</li>
              <li>Apresente o PIN para confirmação</li>
              <li>A loja confirma e o próximo passo é liberado</li>
            </ul>
          </div>

          <div className={styles.actions}>
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

export default RejectDeliveryModal;
