import ProtectedRoute from '../../../components/ProtectedRoute';
import MotoboyShell from '../../../components/motoboy/panel/MotoboyShell';
import { HelpCenter } from '../../../components/drop/HelpCenter';
import { MOTOBOY_HELP_FAQ } from '../../../lib/helpFaq';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';

/** Ajuda do motoboy: a mesma central do cliente e da loja (dúvidas + chamados), na casca do painel. */
export default function MotoboyPerfilAjuda() {
  return (
    <ProtectedRoute required_role="motoboy">
      <HelpCenter
        faq={MOTOBOY_HELP_FAQ}
        frame={(content, inThread) => (inThread ? <>{content}</> : <MotoboyShell title="Ajuda e suporte" back={MOTOBOY_ROUTES.perfil}>{content}</MotoboyShell>)}
      />
    </ProtectedRoute>
  );
}
