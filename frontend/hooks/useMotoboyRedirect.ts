import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';

/** Rota compartilhada com outros papéis: só o MOTOBOY vai para a tela nova do painel dele (fase D2). Os outros ficam. */
export function useMotoboyRedirect(to: string | null): void {
  const router = useRouter();
  const { user, loading } = useAuth() || ({} as any);
  const role = user?.activeRole || user?.role;
  useEffect(() => {
    if (!loading && to && role === 'motoboy') router.replace(to);
  }, [loading, to, role, router]);
}
