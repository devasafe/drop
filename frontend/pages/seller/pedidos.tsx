import ProtectedRoute from '../../components/ProtectedRoute';
import { SellerShell } from '../../components/seller/panel/SellerShell';

/** Aba Pedidos (D1). Esqueleto da P5: a parte P6 preenche. */
export default function SellerPedidosPage() {
  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell title="Pedidos">
        <p data-stub="P5">Esta tela está sendo preparada.</p>
      </SellerShell>
    </ProtectedRoute>
  );
}
