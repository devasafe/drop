import ProtectedRoute from '../../../components/ProtectedRoute';
import MotoboyShell from '../../../components/motoboy/panel/MotoboyShell';
import { ComoCalculamos } from '../../../components/motoboy/ganhos/ComoCalculamos';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';

/** Substitui /motoboy/ajuda-ganhos (redirect em lib/redirects.js). */
export default function ComoCalculamosPage() {
  return (
    <ProtectedRoute required_role="motoboy">
      <MotoboyShell title="Como você ganha" back={MOTOBOY_ROUTES.ganhos()}>
        <ComoCalculamos />
      </MotoboyShell>
    </ProtectedRoute>
  );
}
