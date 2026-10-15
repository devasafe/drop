// Detalhe da entrega (DS v2, D2 · P4.5): corrida encerrada com horários, conta da nota e suporte.
// A corrida concluída que se abre em /motoboy/corrida/[id] vem para cá (Task 30).
import { useRouter } from 'next/router';
import ProtectedRoute from '../../../components/ProtectedRoute';
import MotoboyShell from '../../../components/motoboy/panel/MotoboyShell';
import { EntregaDetail } from '../../../components/motoboy/entregas/EntregaDetail';
import { Skeleton } from '../../../components/ui/Skeleton';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';

export default function MotoboyEntregaPage() {
  const router = useRouter();
  const id = typeof router.query?.id === 'string' ? router.query.id : null;
  return (
    <ProtectedRoute required_role="motoboy">
      {id ? (
        <EntregaDetail key={id} id={id} />
      ) : (
        <MotoboyShell title="Corrida" back={MOTOBOY_ROUTES.entregas('concluidas')}>
          <div role="status" aria-label="Carregando"><Skeleton height={160} /></div>
        </MotoboyShell>
      )}
    </ProtectedRoute>
  );
}
