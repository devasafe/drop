import ProtectedRoute from '../../components/ProtectedRoute';
import { NivelScreen } from '../../components/motoboy/nivel/NivelScreen';

/** Aba Nível do motoboy (D2). As URLs antigas de pontos e benefícios chegam por lib/redirects.js. */
export default function MotoboyNivel() {
  return (
    <ProtectedRoute required_role="motoboy">
      <NivelScreen />
    </ProtectedRoute>
  );
}
