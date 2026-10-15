import ProtectedRoute from '../../../components/ProtectedRoute';
import MotoboyShell from '../../../components/motoboy/panel/MotoboyShell';
import { ComoCalculamos } from '../../../components/motoboy/ganhos/ComoCalculamos';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';

/** Como calculamos os ganhos; a URL antiga chega por lib/redirects.js. */
export default function ComoCalculamosPage() {
  return (
    <ProtectedRoute required_role="motoboy">
      <MotoboyShell title="Como você ganha" back={MOTOBOY_ROUTES.ganhos()}>
        <ComoCalculamos />
      </MotoboyShell>
    </ProtectedRoute>
  );
}
