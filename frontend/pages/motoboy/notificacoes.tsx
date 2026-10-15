import ProtectedRoute from '../../components/ProtectedRoute';
import { NotificacoesScreen } from '../../components/motoboy/perfil/NotificacoesScreen';

export default function MotoboyNotificacoes() {
  return (
    <ProtectedRoute required_role="motoboy">
      <NotificacoesScreen />
    </ProtectedRoute>
  );
}
