// frontend/components/motoboy/cadastro/AnaliseStep.tsx
import { EmAnalise } from '../corridas/EmAnalise';

/**
 * Etapa 4 do cadastro (protótipo 12): tudo enviado, esperando a equipe.
 * Reaproveita o "Em análise" da Corridas (K33): mesma linha do tempo e mesmo "Enquanto isso".
 * A troca para Corridas acontece na próxima leitura do cadastro.
 */
export function AnaliseStep() {
  return <EmAnalise state="review" />;
}

export default AnaliseStep;
