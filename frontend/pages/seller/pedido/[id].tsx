import ProtectedRoute from '../../../components/ProtectedRoute';
import { SellerShell } from '../../../components/seller/panel/SellerShell';
import { SELLER_ROUTES } from '../../../lib/sellerRoutes';

/** Pedido da loja (D1). Esqueleto da P5: a parte P6 preenche. */
export default function SellerPedidoPage() {
  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell title="Pedido" back={SELLER_ROUTES.pedidos()}>
        <p data-stub="P5">Esta tela está sendo preparada.</p>
      </SellerShell>
    </ProtectedRoute>
  );
}
