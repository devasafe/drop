import { useState, useCallback } from 'react';
import api from '../lib/api';

export const useCancellation = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ========== CUSTOMER CANCELLATION ==========

  const cancelOrder = useCallback(
    async (orderId: string, reason: string, reasonCode?: string) => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.post(`/orders/${orderId}/cancel`, {
          reason,
          reasonCode: reasonCode || 'customer_request',
        });

        return {
          success: true,
          data: response.data,
          message: 'Pedido cancelado com sucesso',
        };
      } catch (err: any) {
        const errorMessage = err.response?.data?.error || 'Erro ao cancelar pedido';
        setError(errorMessage);

        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ========== MOTOBOY REJECTION ==========

  /**
   * Motoboy rejeita uma entrega
   * @param deliveryId - ID da entrega
   * @param reason - Razão da rejeição
   * @param action - 'reassign' (volta ao pool) ou 'cancel' (cancela completamente)
   * @param reasonCode - Código predefinido (opcional)
   */
  const rejectDelivery = useCallback(
    async (
      deliveryId: string,
      reason: string,
      action: 'reassign' | 'cancel',
      reasonCode?: string
    ) => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.post(`/deliveries/${deliveryId}/reject`, {
          reason,
          action,
          reasonCode: reasonCode || 'motoboy_rejected',
        });

        // ✅ FIX #6: Aceitar 202 (Accepted) como sucesso para cancelamento com devolução
        const isSuccess = response.status === 200 || response.status === 202;

        if (action === 'reassign') {
          const isPending = response.status === 202;
          return {
            success: true,
            data: response.data,
            message: isPending
              ? 'Produto precisa ser devolvido à loja antes da reatribuição. PIN gerado.'
              : 'Entrega devolvida ao pool',
            isPending,
            pinDevolucao: response.data?.pinDevolucao,
          };
        } else {
          // action === 'cancel'
          const message =
            response.status === 202
              ? 'Devolução solicitada. Aguardando confirmação da loja com PIN.'
              : 'Entrega cancelada com sucesso';

          return {
            success: true,
            data: response.data,
            message,
            isPending: response.status === 202, // Flag para indicar status pendente
            pinDevolucao: response.data?.pinDevolucao // ✅ FIX #6: Retornar PIN
          };
        }
      } catch (err: any) {
        const errorMessage = err.response?.data?.error || 'Erro ao rejeitar entrega';
        setError(errorMessage);

        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ========== STORE OPERATIONS ==========

  const acceptOrder = useCallback(async (orderId: string, distance?: number) => {
    setLoading(true);
    setError(null);

    try {
      const payload = distance !== undefined ? { distance } : {};
      const response = await api.post(`/orders/${orderId}/accept`, payload);

      return {
        success: true,
        data: response.data,
        message: 'Pedido aceito com sucesso',
      };
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Erro ao aceitar pedido';
      setError(errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setLoading(false);
    }
  }, []);

  const rejectOrder = useCallback(
    async (orderId: string, reason: string, reasonCode?: string) => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.post(`/orders/${orderId}/reject`, {
          reason,
          reasonCode: reasonCode || 'store_rejected',
        });

        return {
          success: true,
          data: response.data,
          message: 'Pedido rejeitado com sucesso',
        };
      } catch (err: any) {
        const errorMessage = err.response?.data?.error || 'Erro ao rejeitar pedido';
        setError(errorMessage);

        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ========== HISTORY & STATS ==========

  const getCancellationHistory = useCallback(async (orderId: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/orders/${orderId}/cancellations`);
      return {
        success: true,
        data: response.data.history,
        count: response.data.count,
      };
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Erro ao buscar histórico';
      setError(errorMessage);

      return {
        success: false,
        error: errorMessage,
        data: [],
      };
    } finally {
      setLoading(false);
    }
  }, []);

  const getCancellationStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/orders/stats/cancellations');
      return {
        success: true,
        data: response.data,
      };
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Erro ao buscar estatísticas';
      setError(errorMessage);

      return {
        success: false,
        error: errorMessage,
        data: null,
      };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    // State
    loading,
    error,

    // Customer operations
    cancelOrder,

    // Motoboy operations
    rejectDelivery,

    // Store operations
    acceptOrder,
    rejectOrder,

    // Analytics
    getCancellationHistory,
    getCancellationStats,
  };
};

export default useCancellation;
