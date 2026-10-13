import ProtectedRoute from '../../components/ProtectedRoute';
import { SellerShell } from '../../components/seller/panel/SellerShell';
import { SELLER_ROUTES } from '../../lib/sellerRoutes';

/** Notificações da loja (D1). Esqueleto da P5: a parte P7 preenche. */
export default function SellerNotificacoesPage() {
  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell title="Notificações" back={SELLER_ROUTES.loja}>
        <p data-stub="P5">Esta tela está sendo preparada.</p>
      </SellerShell>
    </ProtectedRoute>
  );
}
