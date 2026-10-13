import { ReactNode } from 'react';
import { useRouter } from 'next/router';
import { ScreenHeader } from '../../drop/ScreenHeader';
import { sellerShowsTabBar } from '../../../lib/sellerRoutes';
import styles from './SellerShell.module.css';

export interface SellerShellProps {
  title: string;
  /** Rota do "voltar". Com ela, a tela é secundária (header branco); sem ela, é uma das 5 abas. */
  back?: string;
  /** Ação à direita do título (ex.: "Criar", "Marcar lidas"). */
  actions?: ReactNode;
  /** Antes do título (ex.: avatar com as iniciais da loja no topo do Agora). */
  lead?: ReactNode;
  children: ReactNode;
}

/**
 * Casca das telas do painel da loja (D1), no idioma das telas do cliente (`ScreenHeader`).
 * Decisão D7: não usa o provider do painel nem toast e não mostra aviso nem link de conferência de cadastro;
 * testes de telas legadas montam o Shell sem providers.
 */
export function SellerShell({ title, back, actions, lead, children }: SellerShellProps) {
  const router = useRouter();
  // Sem a barra de 5 abas (telas secundárias), o fundo não reserva o espaço dela.
  const noBar = !sellerShowsTabBar(router?.pathname ?? '');
  return (
    <div className={noBar ? `${styles.page} ${styles.noBar}` : styles.page}>
      <div className={back ? styles.topWhite : styles.top} data-shell-top={back ? 'secundaria' : 'aba'}>
        <ScreenHeader title={title} onBack={back ? () => router.push(back) : undefined} end={actions} start={lead} />
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
}

export default SellerShell;
