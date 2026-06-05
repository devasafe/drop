import React, { useState } from 'react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import useCancellation from '@/hooks/useCancellation';

interface CancelOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderStatus: string;
  onSuccess?: () => void;
}

const CANCEL_REASONS = [
  { code: 'customer_request', label: 'Cancelamento solicitado', description: 'Mudei de ideia' },
  { code: 'address_invalid', label: 'Endereço errado', description: 'Informei o endereço incorretamente' },
  { code: 'not_available', label: 'Itens indisponíveis', description: 'Os itens não estão disponíveis' },
  { code: 'payment_issue', label: 'Problema de pagamento', description: 'Problema com o pagamento' },
  { code: 'other', label: 'Outro motivo', description: 'Outro motivo não listado' },
];

export function CancelOrderModal({
  isOpen,
  onClose,
  orderId,
  orderStatus,
  onSuccess,
}: CancelOrderModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>('customer_request');
  const [customReason, setCustomReason] = useState<string>('');
  const [isConfirming, setIsConfirming] = useState(false);

  const { cancelOrder, loading } = useCancellation();

  // Validar se order pode ser cancelada
  const canCancel = ['criado', 'pago', 'enviado'].includes(orderStatus);

  const handleConfirm = async () => {
    setIsConfirming(true);

    // Get the readable reason text or custom text
    let reason = '';
    if (selectedReason === 'other') {
      reason = customReason;
    } else {
      const selectedOption = CANCEL_REASONS.find(r => r.code === selectedReason);
      reason = selectedOption ? selectedOption.description : selectedReason;
    }

    if (!reason.trim()) {
      alert('Por favor, especifique um motivo');
      setIsConfirming(false);
      return;
    }

    const result = await cancelOrder(orderId, reason, selectedReason);

    if (result.success) {
      // Sucesso - notificar pai
      if (onSuccess) onSuccess();

      // Modal fecha automaticamente ou após delay
      setTimeout(() => {
        onClose();
      }, 500);
    } else {
      alert(`Erro: ${result.error}`);
    }

    setIsConfirming(false);
  };

  if (!canCancel) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Cancelar Pedido" size="sm">
        <div className="p-6 text-center">
          <p className="text-red-600 font-semibold mb-2">Pedido não pode ser cancelado</p>
          <p className="text-gray-600 text-sm mb-4">
            Este pedido está em um estágio onde não é mais possível cancelá-lo ({orderStatus}).
          </p>
          {orderStatus === 'entregue' && (
            <p className="text-gray-500 text-xs">
              Se há problemas com o pedido, entre em contato com o atendimento ao cliente.
            </p>
          )}
          <Button onClick={onClose} variant="primary" className="mt-4 w-full">
            Fechar
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cancelar Pedido" size="sm">
      <div className="p-6">
        <p className="text-gray-600 mb-4">
          Tem certeza que deseja cancelar este pedido? Você receberá o reembolso em sua conta.
        </p>

        <div className="space-y-2 mb-4">
          <p className="text-sm font-semibold text-gray-700">Motivo do cancelamento:</p>

          {CANCEL_REASONS.map(option => (
            <label key={option.code} className="flex items-start cursor-pointer p-2 hover:bg-gray-50 rounded">
              <input
                type="radio"
                name="cancel-reason"
                value={option.code}
                checked={selectedReason === option.code}
                onChange={e => setSelectedReason(e.target.value)}
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
              onChange={e => setCustomReason(e.target.value)}
              maxLength={200}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              rows={3}
            />
            <p className="text-xs text-gray-500 mt-1">{customReason.length}/200</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={onClose}
            variant="secondary"
            disabled={loading || isConfirming}
            className="flex-1"
          >
            Voltar
          </Button>
          <Button
            onClick={handleConfirm}
            variant="danger"
            disabled={loading || isConfirming}
            className="flex-1"
          >
            {loading || isConfirming ? 'Processando...' : 'Confirmar Cancelamento'}
          </Button>
        </div>

        <p className="text-xs text-gray-500 mt-4 text-center">
          O cancelamento será processado em até 2 horas úteis.
        </p>
      </div>
    </Modal>
  );
}

export default CancelOrderModal;
