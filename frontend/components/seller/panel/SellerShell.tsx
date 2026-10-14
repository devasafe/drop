import { PanelShell, type PanelShellProps } from '../../panel/PanelShell';
import { sellerShowsTabBar } from '../../../lib/sellerRoutes';

/** Mesma API de antes (D1): title, back, actions, lead, onRetry e children. */
export type SellerShellProps = Omit<PanelShellProps, 'showsTabBar' | 'bare'>;

/**
 * Casca das telas do painel da loja (D1). Desde a D2 é a `PanelShell` com a barra de 5 abas da loja.
 * Decisão D7: não usa o provider do painel nem toast e não mostra aviso nem link de conferência de cadastro;
 * testes de telas legadas montam o Shell sem providers.
 */
export function SellerShell(props: SellerShellProps) {
  return <PanelShell {...props} showsTabBar={sellerShowsTabBar} />;
}

export default SellerShell;
