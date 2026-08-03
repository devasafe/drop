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

// Sem ETA real no backend — progress é só a fração do fluxo.
const PROGRESS: Record<string, number> = {
  criado: 0.15, pago: 0.35, aguardando_motoboy: 0.5, enviado: 0.75,
};

export function activeOrderView(order: any): ActiveOrderView {
  const status = order?.status;
  const shipped = status === 'enviado';
  const preparing = status === 'aguardando_motoboy' || shipped;
  return {
    statusLabel: LABEL[status] ?? 'Em andamento',
    progress: PROGRESS[status] ?? 0.15,
    steps: [
      // 'criado' = loja ainda não aceitou → 1º passo é "Recebido"; a partir de 'pago' vira "Confirmado".
      { label: status === 'criado' ? 'Recebido' : 'Confirmado', done: true },
      { label: 'Preparando', done: preparing },
      { label: 'A caminho', done: shipped },
    ],
  };
}
