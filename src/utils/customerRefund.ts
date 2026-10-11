export type CustomerRefundStage = 'devolvendo' | 'conferindo' | 'resolvendo' | 'devolvido';

/** Etapa do estorno do pedido direto que o CLIENTE vê (nunca o erro interno nem as tentativas). */
export function customerRefundStage(status: string): CustomerRefundStage {
  switch (status) {
    case 'done': return 'devolvido';
    case 'uncertain':
    case 'failed': return 'conferindo';
    case 'failed_final': return 'resolvendo';
    default: return 'devolvendo';
  }
}
