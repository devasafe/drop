import ProtectedRoute from '../../components/ProtectedRoute';
import SellerShell from '../../components/seller/panel/SellerShell';
import { HelpCenter } from '../../components/drop/HelpCenter';
import { SELLER_HELP_FAQ } from '../../lib/helpFaq';
import { SELLER_ROUTES } from '../../lib/sellerRoutes';

/** Ajuda do lojista: mesma central de ajuda do cliente (dúvidas + chamados), dentro da casca do painel. */
export default function SellerAjuda() {
  return (
    <ProtectedRoute required_role="lojista">
      <HelpCenter
        faq={SELLER_HELP_FAQ}
        frame={(content, inThread) => (inThread ? <>{content}</> : <SellerShell title="Ajuda" back={SELLER_ROUTES.loja}>{content}</SellerShell>)}
      />
    </ProtectedRoute>
  );
}
