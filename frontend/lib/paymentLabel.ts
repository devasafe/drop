// Rótulo humano do método de pagamento — util compartilhado (F0.2 do roadmap
// UX/UI/QA). Evita exibir o enum cru (`credit_card`, `pix`) na UI. Aceita os
// valores do enum `PaymentMethod` do backend + sinônimos legados.
export function paymentMethodLabel(method?: string | null): string {
  switch (method) {
    case 'pix':
      return 'PIX';
    case 'credit_card':
      return 'Cartão de crédito';
    case 'debit_card':
      return 'Cartão de débito';
    case 'cash_on_delivery':
    case 'money':
      return 'Na entrega';
    default:
      return method || '—';
  }
}
