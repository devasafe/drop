import React, { useEffect, useState } from 'react';
import Icon, { IconName } from '../Icon';
import useCancellation from '@/hooks/useCancellation';

interface CancellationStatusDisplayProps {
  orderId: string;
  className?: string;
}

const REASON_CODE_LABELS: Record<string, { label: string; icon: IconName; color: string }> = {
  customer_request: {
    label: 'Cancelamento solicitado',
    icon: 'user',
    color: 'bg-blue-50 border-blue-200 text-blue-900',
  },
  not_available: {
    label: 'Itens indisponíveis',
    icon: 'package',
    color: 'bg-orange-50 border-orange-200 text-orange-900',
  },
  store_closed: {
    label: 'Loja fechada',
    icon: 'lock',
    color: 'bg-red-50 border-red-200 text-red-900',
  },
  store_busy: {
    label: 'Loja muito ocupada',
    icon: 'clock',
    color: 'bg-yellow-50 border-yellow-200 text-yellow-900',
  },
  motoboy_unavailable: {
    label: 'Motoboy indisponível',
    icon: 'motorcycle',
    color: 'bg-gray-50 border-gray-200 text-gray-900',
  },
  delivery_failed: {
    label: 'Falha na entrega',
    icon: 'x-circle',
    color: 'bg-red-50 border-red-200 text-red-900',
  },
  customer_unreachable: {
    label: 'Cliente não contactável',
    icon: 'bell',
    color: 'bg-gray-50 border-gray-200 text-gray-900',
  },
  address_invalid: {
    label: 'Endereço inválido',
    icon: 'map-pin',
    color: 'bg-yellow-50 border-yellow-200 text-yellow-900',
  },
  payment_issue: {
    label: 'Problema de pagamento',
    icon: 'credit-card',
    color: 'bg-red-50 border-red-200 text-red-900',
  },
  wrong_order: {
    label: 'Pedido errado',
    icon: 'alert-triangle',
    color: 'bg-orange-50 border-orange-200 text-orange-900',
  },
  damaged_items: {
    label: 'Itens danificados',
    icon: 'alert-triangle',
    color: 'bg-red-50 border-red-200 text-red-900',
  },
  other: {
    label: 'Outro motivo',
    icon: 'edit',
    color: 'bg-gray-50 border-gray-200 text-gray-900',
  },
};

const CANCELLED_BY_LABELS: Record<string, { label: string; icon: IconName }> = {
  customer: { label: 'Cancelado pelo cliente', icon: 'user' },
  store: { label: 'Rejeitado pela loja', icon: 'lock' },
  motoboy: { label: 'Rejeitado pelo motoboy', icon: 'motorcycle' },
  admin: { label: 'Cancelado pelo admin', icon: 'settings' },
};

interface Cancellation {
  _id: string;
  cancelledBy: 'customer' | 'motoboy' | 'store' | 'admin';
  reason: string;
  reasonCode: string;
  refundAmount?: number;
  refundStatus?: 'pending' | 'processed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export function CancellationStatusDisplay({
  orderId,
  className = '',
}: CancellationStatusDisplayProps) {
  const [cancellation, setCancellation] = useState<Cancellation | null>(null);
  const [loading, setLoading] = useState(true);

  const { getCancellationHistory } = useCancellation();

  useEffect(() => {
    const fetchCancellation = async () => {
      setLoading(true);
      const result = await getCancellationHistory(orderId);

      if (result.success && result.data && result.data.length > 0) {
        // Pega o cancelamento mais recente
        setCancellation(result.data[0]);
      }

      setLoading(false);
    };

    if (orderId) {
      fetchCancellation();
    }
  }, [orderId, getCancellationHistory]);

  if (loading) {
    return (
      <div className={`animate-pulse bg-gray-200 h-20 rounded ${className}`} />
    );
  }

  if (!cancellation) {
    return null;
  }

  const reasonInfo =
    REASON_CODE_LABELS[cancellation.reasonCode] ||
    REASON_CODE_LABELS.other;

  const refundStatusLabel: Record<string, string> = {
    pending: 'Pendente',
    processed: 'Processado',
    failed: 'Falhou',
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      className={`border p-4 rounded-lg ${reasonInfo.color} ${className}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon name={CANCELLED_BY_LABELS[cancellation.cancelledBy]?.icon || 'x-circle'} size={18} />
          <span className="font-semibold text-sm">{CANCELLED_BY_LABELS[cancellation.cancelledBy]?.label || 'Cancelado'}</span>
        </div>
        <span className="text-xs opacity-50">{formatDate(cancellation.createdAt)}</span>
      </div>

      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Icon name={reasonInfo.icon} size={24} />
          <div>
            <h4 className="font-semibold text-sm mb-1">{reasonInfo.label}</h4>
            <p className="text-xs opacity-75 mt-2">
              Motivo: <span className="font-medium">{cancellation.reason}</span>
            </p>
          </div>
        </div>
      </div>

      {cancellation.refundAmount !== undefined && (
        <div className="mt-3 pt-3 border-t border-current border-opacity-20">
          <div className="flex justify-between items-center text-sm">
            <span className="opacity-75">Reembolso:</span>
            <span className="font-semibold">
              R$ {cancellation.refundAmount.toFixed(2)}
            </span>
          </div>
          {cancellation.refundStatus && (
            <div className="flex justify-between items-center text-xs mt-2 opacity-75">
              <span>Status:</span>
              <span>{refundStatusLabel[cancellation.refundStatus]}</span>
            </div>
          )}
        </div>
      )}

      {cancellation.refundStatus === 'failed' && (
        <div className="mt-3 p-2 bg-red-100 bg-opacity-50 rounded text-xs">
          <Icon name="alert-triangle" size={14} /> Houve um erro ao processar o reembolso. Entre em contato com o suporte.
        </div>
      )}
    </div>
  );
}

export default CancellationStatusDisplay;
