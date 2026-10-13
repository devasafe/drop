import ProtectedRoute from '../../components/ProtectedRoute';
import { SellerShell } from '../../components/seller/panel/SellerShell';

/** Aba Dinheiro (D1, os dois modos). Esqueleto da P5: a parte P6 preenche. */
export default function SellerDinheiroPage() {
  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell title="Dinheiro">
        <p data-stub="P5">Esta tela está sendo preparada.</p>
      </SellerShell>
    </ProtectedRoute>
  );
}
