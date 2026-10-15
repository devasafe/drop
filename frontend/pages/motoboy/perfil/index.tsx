// frontend/pages/motoboy/perfil/index.tsx
import ProtectedRoute from '../../../components/ProtectedRoute';
import { PerfilScreen } from '../../../components/motoboy/perfil/PerfilScreen';

/** Aba Perfil do motoboy (D2). A URL antiga do perfil chega por lib/redirects.js. */
export default function MotoboyPerfil() {
  return (
    <ProtectedRoute required_role="motoboy">
      <PerfilScreen />
    </ProtectedRoute>
  );
}
