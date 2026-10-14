import { Component, ErrorInfo, Fragment, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '../../ui/EmptyState';
import logger from '../../../lib/logger';

/** Erro do DS v2 no lugar da tela que quebrou ("Tentar de novo" monta a tela outra vez). */
export function ScreenErrorFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert">
      <EmptyState
        variant="error"
        icon={<AlertTriangle size={28} />}
        title="Não deu para abrir esta tela"
        description="Algo deu errado ao mostrar as informações. Tente de novo."
        onRetry={onRetry}
      />
    </div>
  );
}

interface Props {
  children: ReactNode;
  /** Muda de valor (ex.: a rota) → a tela sai do erro e tenta de novo. */
  resetKey?: unknown;
  /** Fallback próprio (ex.: com a casca da tela em volta). Padrão: `ScreenErrorFallback`. */
  renderFallback?: (retry: () => void) => ReactNode;
  /** Chamado no "Tentar de novo", antes de remontar (ex.: reler o pedido). */
  onRetry?: () => void;
}

interface State { failed: boolean; attempt: number }

/**
 * Exceção de render numa tela da loja vira a tela de erro do DS v2, em vez de a página
 * inteira ficar em branco (o Next em produção desmonta tudo numa exceção não tratada).
 */
export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // O Error inteiro (tipo e pilha) e a pilha de componentes.
    logger.error('Tela da loja quebrou no render', error, info?.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
  }

  /** Chave nova: a tela é montada do zero (estado e efeitos de carga rodam de novo). */
  retry = () => {
    this.props.onRetry?.();
    this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
  };

  render() {
    if (!this.state.failed) return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
    return this.props.renderFallback ? this.props.renderFallback(this.retry) : <ScreenErrorFallback onRetry={this.retry} />;
  }
}

export default ScreenErrorBoundary;
