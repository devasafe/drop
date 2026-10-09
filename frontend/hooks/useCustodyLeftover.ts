import { useCustodyLeftoverState } from './useCustodyLeftoverState';

export { __resetCustodyLeftoverCache } from './useCustodyLeftoverState';

/**
 * P16: no modo 'direto', o usuário ainda tem saldo da custódia (repasse em aberto ou
 * carteira com saldo)? Quem decide é o backend. Enquanto carrega, em erro ou fora do
 * modo direto → false (o menu "Saldo do modo anterior" fica escondido; o backend é
 * quem libera ou bloqueia as rotas de verdade).
 */
export function useCustodyLeftover(): boolean {
  return useCustodyLeftoverState().hasLeftover;
}
