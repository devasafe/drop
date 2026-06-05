import React, { useState, useEffect } from 'react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import useCancellation from '@/hooks/useCancellation';
import { useSocket } from '@/contexts/SocketContext';

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

  // Produto já foi retirado — fluxo de devolução com PIN é necessário
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
    if (step === 'action') {
      setStep('reason');
    } else if (step === 'confirm') {
      setStep('action');
    }
  };

  const handleConfirm = async () => {
    clearError();
    let reason = '';
    if (selectedReason === 'other') {
      reason = customReason;
    } else {
      const selectedOption = REJECTION_REASONS.find(r => r.code === selectedReason);
      reason = selectedOption ? selectedOption.description : selectedReason;
    }

    const result = await rejectDelivery(deliveryId, reason, selectedAction, selectedReason);

    if (result.success) {
      if (result.isPending) {
        // Produto foi retirado — aguarda confirmação da loja com PIN (cancel ou reassign)
        const pinDisplay = result.data?.pinDevolucao || result.pinDevolucao || 'Aguarde...';
        setWaitingMessage(pinDisplay);
        setStep('waiting');
      } else {
        // Cancelamento/reassign direto (assigned) — fecha modal
        if (onSuccess) onSuccess();
        onClose();
      }
    } else {
      setError(result.error || 'Erro ao processar rejeição.');
    }
  };

  // Listener para confirmação de devolução pela loja
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
      <Modal isOpen={isOpen} onClose={onClose} title="Rejeitar Entrega" size="sm">
        <div className="p-6 text-center">
          <p className="text-red-600 font-semibold mb-2">Entrega não pode ser rejeitada</p>
          <p className="text-gray-600 text-sm mb-4">
            Esta entrega está em um estágio onde não é mais possível rejeitá-la ({deliveryStatus}).
          </p>
          <Button onClick={onClose} variant="primary" className="mt-4 w-full">
            Fechar
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Rejeitar Entrega" size="sm">
      <div className="p-6">
        {/* Step 1: Reason Selection */}
        {step === 'reason' && (
          <>
            <p className="text-gray-600 mb-4">Por que você quer rejeitar esta entrega?</p>

            <div className="space-y-2 mb-4">
              {REJECTION_REASONS.map(option => (
                <label key={option.code} className="flex items-start cursor-pointer p-2 hover:bg-gray-50 rounded">
                  <input
                    type="radio"
                    name="reject-reason"
                    value={option.code}
                    checked={selectedReason === option.code}
                    onChange={e => { setSelectedReason(e.target.value); clearError(); }}
                    className="mt-1 mr-3"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-700">{option.label}</p>
                    <p className="text-xs text-gray-500">{option.description}</p>
                  </div>
                </label>
              ))}
            </div>

            {selectedReason === 'other' && (
              <div className="mb-4">
                <textarea
                  placeholder="Descreva o motivo..."
                  value={customReason}
                  onChange={e => { setCustomReason(e.target.value); clearError(); }}
                  maxLength={200}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  rows={3}
                />
                <p className="text-xs text-gray-500 mt-1">{customReason.length}/200</p>
              </div>
            )}

            {error && <p className="text-red-600 text-xs mb-3 font-medium">{error}</p>}

            <div className="flex gap-2">
              <Button onClick={onClose} variant="secondary" disabled={loading} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={handleNext} variant="primary" disabled={loading} className="flex-1">
                Próximo
              </Button>
            </div>
          </>
        )}

        {/* Step 2: Action Selection */}
        {step === 'action' && (
          <>
            <p className="text-gray-600 mb-4">O que deseja fazer com esta entrega?</p>

            <div className="space-y-3 mb-4">
              <label className="flex items-start cursor-pointer p-3 border-2 border-gray-200 rounded hover:border-orange-300 hover:bg-orange-50" style={{borderColor: selectedAction === 'reassign' ? '#f97316' : undefined}}>
                <input
                  type="radio"
                  name="action"
                  value="reassign"
                  checked={selectedAction === 'reassign'}
                  onChange={e => setSelectedAction(e.target.value as 'reassign' | 'cancel')}
                  className="mt-1 mr-3"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-700">Devolver ao Pool</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {requiresReturnPin
                      ? 'O produto já foi retirado. Você precisará devolvê-lo à loja com um PIN. Após confirmação, outro motoboy será atribuído. O cliente não será reembolsado.'
                      : 'A entrega volta para a fila e outro motoboy pode reivindicá-la. Você não ganha os pontos.'}
                  </p>
                </div>
              </label>

              <label className="flex items-start cursor-pointer p-3 border-2 border-gray-200 rounded hover:border-red-300 hover:bg-red-50" style={{borderColor: selectedAction === 'cancel' ? '#ef4444' : undefined}}>
                <input
                  type="radio"
                  name="action"
                  value="cancel"
                  checked={selectedAction === 'cancel'}
                  onChange={e => setSelectedAction(e.target.value as 'reassign' | 'cancel')}
                  className="mt-1 mr-3"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-700">Cancelar Entrega</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {requiresReturnPin
                      ? 'A entrega é cancelada. Como o produto já foi retirado, você deverá devolvê-lo na loja usando um PIN de confirmação.'
                      : 'A entrega é cancelada completamente. O cliente receberá reembolso imediato. Use apenas em última instância.'}
                  </p>
                </div>
              </label>
            </div>

            {error && <p className="text-red-600 text-xs mb-3 font-medium">{error}</p>}

            <div className="flex gap-2">
              <Button onClick={handleBack} variant="secondary" disabled={loading} className="flex-1">
                Voltar
              </Button>
              <Button onClick={handleNext} variant="primary" disabled={loading} className="flex-1">
                Próximo
              </Button>
            </div>
          </>
        )}

        {/* Step 3: Confirmation */}
        {step === 'confirm' && (
          <>
            <div className="bg-gray-50 p-4 rounded-md mb-4">
              <h4 className="font-semibold text-gray-700 mb-2">Resumo da Rejeição</h4>

              <div className="space-y-2 text-sm text-gray-600">
                <p>
                  <span className="font-medium">Motivo:</span>{' '}
                  {REJECTION_REASONS.find(r => r.code === selectedReason)?.label || customReason}
                </p>
                <p>
                  <span className="font-medium">Ação:</span>{' '}
                  {selectedAction === 'reassign' ? 'Devolver ao Pool' : 'Cancelar Entrega'}
                </p>
              </div>
            </div>

            {requiresReturnPin && (
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-md mb-4">
                <p className="text-xs text-blue-900">
                  Como o produto já foi retirado, você precisará devolvê-lo na loja com um PIN de confirmação.
                  {selectedAction === 'cancel'
                    ? ' O cliente será reembolsado após a confirmação.'
                    : ' Após confirmação, outro motoboy será atribuído.'}
                </p>
              </div>
            )}

            {error && <p className="text-red-600 text-xs mb-3 font-medium">{error}</p>}

            <div className="flex gap-2">
              <Button onClick={handleBack} variant="secondary" disabled={loading} className="flex-1">
                Voltar
              </Button>
              <Button
                onClick={handleConfirm}
                variant={selectedAction === 'cancel' ? 'danger' : 'primary'}
                disabled={loading}
                className="flex-1"
              >
                {loading ? 'Processando...' : selectedAction === 'reassign' ? 'Devolver Entrega' : 'Cancelar Entrega'}
              </Button>
            </div>
          </>
        )}

        {/* Step 4: Waiting for Store Confirmation */}
        {step === 'waiting' && (
          <>
            <div className="text-center py-8">
              <div className="mb-4">
                <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
              </div>

              <h4 className="text-lg font-semibold text-gray-800 mb-2">Aguardando Confirmação da Loja</h4>

              <div className="bg-blue-100 border-2 border-blue-500 p-6 rounded-md mb-6">
                <p className="text-xs text-blue-700 font-medium mb-2">Seu PIN de Devolução:</p>
                <p className="text-4xl font-bold text-blue-600 font-mono tracking-widest">{waitingMessage}</p>
                <p className="text-xs text-blue-600 mt-2">Anote este PIN e leve para a loja</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 p-4 rounded-md">
                <p className="text-xs text-amber-900 font-medium mb-2">Próximos Passos:</p>
                <ul className="text-xs text-amber-800 text-left space-y-1">
                  <li>Guarde o PIN acima com você</li>
                  <li>Vá até a loja com o produto</li>
                  <li>Apresente o PIN para confirmação</li>
                  <li>A loja confirmará e o próximo passo será liberado</li>
                </ul>
              </div>

              <div className="bg-green-50 border border-green-200 p-3 rounded-md mt-4">
                <p className="text-xs text-green-800">
                  A loja foi notificada e está aguardando sua chegada com o PIN.
                </p>
              </div>

              <Button onClick={onClose} variant="secondary" className="mt-6 w-full">
                Fechar
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default RejectDeliveryModal;
