// Lógica pura do card de pedido ativo da Home do cliente — extraída do inicio.tsx.

export const ACTIVE_STATUSES = ['criado', 'pago', 'aguardando_motoboy', 'enviado'] as const;

export function isActiveOrder(status: string): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

function ts(o: any): number {
  const v = o?.createdAt;
  const n = typeof v === 'number' ? v : Date.parse(v);
  return Number.isNaN(n) ? 0 : n;
}

export function pickActiveOrders(orders: any[]): any[] {
  return (orders || []).filter((o) => isActiveOrder(o?.status)).sort((a, b) => ts(b) - ts(a));
}

export interface ActiveOrderView {
  statusLabel: string;
  progress: number;
  steps: { label: string; done: boolean }[];
}

// Fase mostrada no topo do tracker. Nunca hardcode "A caminho" p/ pedido em preparo.
const LABEL: Record<string, string> = {
  criado: 'Aguardando confirmação',
  pago: 'Preparando',
  aguardando_motoboy: 'Buscando entregador',
  enviado: 'A caminho',
};

export function activeOrderView(order: any): ActiveOrderView {
  const status = order?.status;
  // Os mesmos 5 passos da tela de acompanhamento (deriveSteps do useOrderTracking),
  // derivados só do order.status — o card da Home não tem o delivery em mãos.
  const steps = [
    { label: 'Criado', done: !!status },
    { label: 'Pago', done: !!status && status !== 'criado' },
    { label: 'Aceito', done: ['pago', 'aguardando_motoboy', 'enviado', 'entregue'].includes(status) },
    { label: 'A caminho', done: status === 'enviado' || status === 'entregue' },
    { label: 'Entregue', done: status === 'entregue' },
  ];
  // Sem ETA real no backend — a barra reflete a fração de passos já concluídos.
  const doneCount = steps.filter((s) => s.done).length;
  return {
    statusLabel: LABEL[status] ?? 'Em andamento',
    progress: doneCount / steps.length,
    steps,
  };
}
