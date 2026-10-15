import ProtectedRoute from '../../components/ProtectedRoute';
import { RankingScreen } from '../../components/motoboy/nivel/RankingScreen';

/** Ranking do mês do motoboy (D2), aberto pela aba Nível. */
export default function MotoboyRanking() {
  return (
    <ProtectedRoute required_role="motoboy">
      <RankingScreen />
    </ProtectedRoute>
  );
}
