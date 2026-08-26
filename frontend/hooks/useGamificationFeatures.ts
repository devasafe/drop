import { useEffect, useState } from 'react';
import api from '../lib/api';

export interface GamificationFeatures {
  gamificationPointsEnabled: boolean;
  benefitsRedeemEnabled: boolean;
  rankingPrizesEnabled: boolean;
}

/** Estado dos freios de gamificação. Enquanto carrega/falha, assume PAUSADO
 *  (mostra "Em breve") — evita expor uma função paga por engano. */
export function useGamificationFeatures() {
  const [features, setFeatures] = useState<GamificationFeatures>({
    gamificationPointsEnabled: false,
    benefitsRedeemEnabled: false,
    rankingPrizesEnabled: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get<GamificationFeatures>('/gamification/features')
      .then((r) => { if (alive) setFeatures(r.data); })
      .catch(() => { /* mantém pausado */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return { features, loading };
}
