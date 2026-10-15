import ProtectedRoute from '../../../components/ProtectedRoute';
import { DadosScreen } from '../../../components/motoboy/perfil/DadosScreen';

export default function MotoboyPerfilDados() {
  return (
    <ProtectedRoute required_role="motoboy">
      <DadosScreen />
    </ProtectedRoute>
  );
}
