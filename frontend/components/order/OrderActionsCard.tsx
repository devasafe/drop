import React, { useState } from 'react';
import Button from '@/components/common/Button';
import Modal from '@/components/common/Modal';
import useCancellation from '@/hooks/useCancellation';
import Icon from '@/components/Icon';

interface OrderActionsCardProps {
  orderId: string;
  orderStatus: string;
  onStatusChange?: (newStatus: string) => void;
  className?: string;
}

const REJECTION_REASONS = [
  { code: 'store_closed', label: 'Loja fechada', description: 'Loja está fechada no momento' },
  { code: 'store_busy', label: 'Loja muito ocupada', description: 'Muitos pedidos para processar' },
  { code: 'not_available', label: 'Itens indisponíveis', description: 'Item fora de estoque' },
  { code: 'payment_issue', label: 'Problema de pagamento', description: 'Problema com o pagamento' },
  { code: 'other', label: 'Outro motivo', description: 'Especifique abaixo' },
];

export function OrderActionsCard({
  orderId,
  orderStatus,
  onStatusChange,
  className = '',
}: OrderActionsCardProps) {
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState('store_closed');
  const [customReason, setCustomReason] = useState('');

  const { acceptOrder, rejectOrder, loading } = useCancellation();

  // Apenas pedidos em 'criado' podem ser aceitos/rejeitados
  const canActuate = orderStatus === 'criado';

  const handleAccept = async () => {
    if (window.confirm('Deseja aceitar este pedido?')) {
      const result = await acceptOrder(orderId);
      if (result.success) {
        onStatusChange?.('pago');
      } else {
        alert(`Erro: ${result.error}`);
      }
    }
  };

  const handleRejectConfirm = async () => {
    let reason = '';
    if (selectedReason === 'other') {
      reason = customReason;
    } else {
      const selectedOption = REJECTION_REASONS.find(r => r.code === selectedReason);
      reason = selectedOption ? selectedOption.description : selectedReason;
    }

    if (!reason.trim()) {
      alert('Por favor, especifique um motivo');
      return;
    }

    const result = await rejectOrder(orderId, reason, selectedReason);

    if (result.success) {
      setRejectModalOpen(false);
      onStatusChange?.('cancelado');
    } else {
      alert(`Erro: ${result.error}`);
    }
  };

  if (!canActuate) {
    return (
      <div className={`bg-gray-50 p-4 rounded-lg border border-gray-200 ${className}`}>
        <p className="text-sm text-gray-500">
          Pedido em status <span className="font-semibold capitalize">{orderStatus}</span>. Ações não disponíveis.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={`bg-blue-50 p-4 rounded-lg border border-blue-200 ${className}`}>
        <h3 className="text-sm font-semibold text-blue-900 mb-3">Ações do Pedido</h3>

        <p className="text-xs text-blue-800 mb-3">
          Este pedido está aguardando sua resposta. Aceite para preparar ou rejeite com um motivo.
        </p>

        <div className="flex gap-2">
          <Button
            onClick={handleAccept}
            variant="success"
            disabled={loading}
            className="flex-1"
          >
            {loading ? 'Processando...' : '✓ Aceitar Pedido'}
          </Button>

          <Button
            onClick={() => setRejectModalOpen(true)}
            variant="danger"
            disabled={loading}
            className="flex-1"
          >
            {loading ? 'Processando...' : '✕ Rejeitar'}
          </Button>
        </div>

        <p className="text-xs text-blue-700 mt-3">
          <Icon name="info" size={14} /> Aceite para mover o pedido para preparação. Rejeite se houver indisponibilidade.
        </p>
      </div>

      {/* Reject Modal */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Rejeitar Pedido"
        size="sm"
      >
        <div className="p-6">
          <p className="text-gray-600 mb-4">
            O cliente receberá reembolso automático. Especifique o motivo:
          </p>

          <div className="space-y-2 mb-4">
            {REJECTION_REASONS.map(option => (
              <label
                key={option.code}
                className="flex items-start cursor-pointer p-2 hover:bg-gray-50 rounded"
              >
                <input
                  type="radio"
                  name="reject-reason"
                  value={option.code}
                  checked={selectedReason === option.code}
                  onChange={e => setSelectedReason(e.target.value)}
                  className="mt-1 mr-3"
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">{option.label}</p>
                  {option.description && (
                    <p className="text-xs text-gray-500">{option.description}</p>
                  )}
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

          <div className="bg-red-50 border border-red-200 p-3 rounded-md mb-4">
            <p className="text-xs text-red-900">
              <Icon name="alert-triangle" size={14} /> O cliente será notificado do cancelamento e receberá reembolso em até 2 horas.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => setRejectModalOpen(false)}
              variant="secondary"
              disabled={loading}
              className="flex-1"
            >
              Voltar
            </Button>
            <Button
              onClick={handleRejectConfirm}
              variant="danger"
              disabled={loading}
              className="flex-1"
            >
              {loading ? 'Processando...' : 'Confirmar Rejeição'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default OrderActionsCard;
