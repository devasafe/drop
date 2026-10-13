import { ReactNode } from 'react';
import { isSellerPanelRoute } from '../../../lib/sellerRoutes';
import { SellerPanelProvider } from './SellerPanelProvider';

/** Monta o painel da loja só nas rotas da loja e só com alguém logado (usado no _app). */
export function SellerPanelGate({ pathname, enabled, children }: { pathname: string; enabled: boolean; children: ReactNode }) {
  if (!enabled || !isSellerPanelRoute(pathname)) return <>{children}</>;
  return <SellerPanelProvider>{children}</SellerPanelProvider>;
}

export default SellerPanelGate;
