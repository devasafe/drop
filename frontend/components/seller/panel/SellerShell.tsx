import { ReactNode } from 'react';
import { useRouter } from 'next/router';
import { ScreenHeader } from '../../drop/ScreenHeader';
import styles from './SellerShell.module.css';

export interface SellerShellProps {
  title: string;
  /** Rota do "voltar". Com ela, a tela é secundária (header branco); sem ela, é uma das 5 abas. */
  back?: string;
  /** Ação à direita do título (ex.: "Criar", "Marcar lidas"). */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Casca das telas do painel da loja (D1), no idioma das telas do cliente (`ScreenHeader`).
 * Decisão D7: não usa o provider do painel nem toast e não mostra aviso nem link de conferência de cadastro;
 * testes de telas legadas montam o Shell sem providers.
 */
export function SellerShell({ title, back, actions, children }: SellerShellProps) {
  const router = useRouter();
  return (
    <div className={styles.page}>
      <div className={back ? styles.topWhite : styles.top} data-shell-top={back ? 'secundaria' : 'aba'}>
        <ScreenHeader title={title} onBack={back ? () => router.push(back) : undefined} end={actions} />
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
}

export default SellerShell;
