import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';

/** Rota compartilhada com outros papéis: só o LOJISTA vai para a tela nova da loja (fase D1). Os outros ficam. */
export function useLojistaRedirect(to: string | null): void {
  const router = useRouter();
  const { user, loading } = useAuth() || ({} as any);
  const role = user?.activeRole || user?.role;
  useEffect(() => {
    if (!loading && to && role === 'lojista') router.replace(to);
  }, [loading, to, role, router]);
}
