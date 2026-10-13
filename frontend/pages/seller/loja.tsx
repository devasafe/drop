import ProtectedRoute from '../../components/ProtectedRoute';
import { SellerShell } from '../../components/seller/panel/SellerShell';

/** Aba Loja (D1). Esqueleto da P5: a parte P7 preenche. */
export default function SellerLojaPage() {
  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell title="Loja">
        <p data-stub="P5">Esta tela está sendo preparada.</p>
      </SellerShell>
    </ProtectedRoute>
  );
}
