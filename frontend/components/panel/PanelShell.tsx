import { ReactNode } from 'react';
import { useRouter } from 'next/router';
import { ScreenHeader } from '../drop/ScreenHeader';
import { ScreenErrorBoundary } from '../seller/panel/ScreenErrorBoundary';
import styles from './PanelShell.module.css';

export interface PanelShellProps {
  title: string;
  /** Rota do "voltar". Com ela, a tela é secundária (header branco); sem ela, é uma aba. */
  back?: string;
  /** Ação à direita do título (ex.: "?", "Marcar lidas"). */
  actions?: ReactNode;
  /** Antes do título (ex.: avatar no topo do Agora ou do Corridas). */
  lead?: ReactNode;
  /** "Tentar de novo" da tela de erro do corpo: relê os dados antes de remontar. */
  onRetry?: () => void;
  children: ReactNode;
  /** Decide, pelo router.pathname, se a tela tem a barra de abas (o fundo reserva o espaço dela). */
  showsTabBar: (pathname: string) => boolean;
  /** Sem topo (ex.: "Entrega concluída"): a própria tela tem o título; o conteúdo fica nomeado por `title`. */
  bare?: boolean;
}

/**
 * Casca das telas de painel (loja D1, motoboy D2), no idioma das telas do cliente (`ScreenHeader`).
 * Não usa provider de painel nem toast: testes de telas legadas montam a casca sem providers (D7).
 */
export function PanelShell({ title, back, actions, lead, onRetry, children, showsTabBar, bare }: PanelShellProps) {
  const router = useRouter();
  // Sem a barra de abas (telas de fluxo), o fundo não reserva o espaço dela.
  const noBar = !showsTabBar(router?.pathname ?? '');
  return (
    <div
      className={noBar ? `${styles.page} ${styles.noBar}` : styles.page}
      role={bare ? 'region' : undefined}
      aria-label={bare ? title : undefined}
    >
      {!bare && (
        <div className={back ? styles.topWhite : styles.top} data-shell-top={back ? 'secundaria' : 'aba'}>
          <ScreenHeader title={title} onBack={back ? () => router.push(back) : undefined} end={actions} start={lead} />
        </div>
      )}
      <div className={styles.body}>
        {/* Exceção de render no conteúdo: erro com "Tentar de novo" e o topo continua (nunca tela branca). */}
        <ScreenErrorBoundary resetKey={router?.asPath} onRetry={onRetry}>{children}</ScreenErrorBoundary>
      </div>
    </div>
  );
}

export default PanelShell;
