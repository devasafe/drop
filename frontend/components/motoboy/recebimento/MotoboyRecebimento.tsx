// frontend/components/motoboy/recebimento/MotoboyRecebimento.tsx
import { ReactNode } from 'react';
import blocks from '../../panel/PanelBlocks.module.css';
import { RecebimentoForm } from '../../onboarding/RecebimentoForm';
import { Alert } from '../../ui/Alert';
import { Skeleton } from '../../ui/Skeleton';
import { useSaasConfig } from '../../../hooks/useSaasConfig';

export interface MotoboyRecebimentoProps {
  onSaved?: () => void;
  /** Conteúdo depois do formulário, só quando o modo é conhecido (ex.: saque mínimo na custódia). */
  after?: (mode: 'custodia' | 'direto') => ReactNode;
}

/**
 * Chave Pix do motoboy: /dados-recebimento e a etapa Recebimento do cadastro (P5.9).
 * O formulário chama rotas diferentes por modo, então sem o modo confirmado ele não abre (K29):
 * carregando, só o esqueleto; com erro, o aviso com "Tentar de novo". Nunca presume custódia.
 */
export function MotoboyRecebimento({ onSaved, after }: MotoboyRecebimentoProps) {
  const { settlementMode, loading, error, retry } = useSaasConfig();
  if (error) {
    return (
      <Alert tone="error" title="Não carregamos o modo de pagamento." action={{ label: 'Tentar de novo', onClick: () => retry?.() }}>
        Confira sua conexão.
      </Alert>
    );
  }
  if (loading) return <Skeleton height={200} radius="var(--radius-lg)" />;
  const direct = settlementMode === 'direto';
  return (
    <>
      <p className={blocks.sub}>
        {direct ? 'Na entrega, a loja manda o Pix direto para esta chave.' : 'Seus saques caem nesta chave Pix.'}
      </p>
      <RecebimentoForm direct={direct} store={false} onSaved={onSaved} />
      {after?.(direct ? 'direto' : 'custodia')}
    </>
  );
}

export default MotoboyRecebimento;
