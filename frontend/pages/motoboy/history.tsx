import { useEffect } from 'react';
import { useRouter } from 'next/router';

/**
 * /motoboy/history foi unificada na aba "Histórico" de /motoboy/ongoing
 * (Etapa 8). Mantido como redirect para não quebrar links antigos.
 */
export default function MotoboyHistoryRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/motoboy/ongoing?tab=history');
  }, [router]);
  return null;
}
