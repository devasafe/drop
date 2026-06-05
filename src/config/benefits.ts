export interface Benefit {
  id: string;
  name: string;
  description: string;
  cost: number;
  type: 'wallet' | 'system';
  icon: string;
}

export const BENEFITS: Benefit[] = [
  {
    id: 'priority_week',
    name: 'Prioridade nas Rotas — 7 dias',
    description: 'Receba prioridade no aceite de entregas por uma semana',
    cost: 100,
    type: 'system',
    icon: '🚀',
  },
  {
    id: 'double_points_24h',
    name: 'Pontos em Dobro — 24h',
    description: 'Ganhe o dobro de pontos em todas as entregas pelo próximo dia',
    cost: 200,
    type: 'system',
    icon: '⚡',
  },
  {
    id: 'fee_waiver',
    name: 'Próxima Taxa Zerada',
    description: 'Sua próxima entrega não terá desconto da plataforma',
    cost: 300,
    type: 'system',
    icon: '🎁',
  },
  {
    id: 'wallet_bonus_20',
    name: 'Bônus R$ 20 na Carteira',
    description: 'Receba R$ 20,00 diretamente na sua carteira DROP',
    cost: 500,
    type: 'wallet',
    icon: '💰',
  },
  {
    id: 'wallet_bonus_50',
    name: 'Bônus R$ 50 na Carteira',
    description: 'Receba R$ 50,00 diretamente na sua carteira DROP',
    cost: 1200,
    type: 'wallet',
    icon: '💎',
  },
];
