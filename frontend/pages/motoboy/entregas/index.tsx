import ProtectedRoute from '../../../components/ProtectedRoute';
import MotoboyShell from '../../../components/motoboy/panel/MotoboyShell';
import { EntregasScreen } from '../../../components/motoboy/entregas/EntregasScreen';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';

/** /motoboy/entregas — substitui /motoboy/ongoing e /motoboy/history (redirects em lib/redirects.js). */
export default function MotoboyEntregasPage() {
  return (
    <ProtectedRoute required_role="motoboy">
      <MotoboyShell title="Suas entregas" back={MOTOBOY_ROUTES.corridas}>
        <EntregasScreen />
      </MotoboyShell>
    </ProtectedRoute>
  );
}
