import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';

/** Rota compartilhada com os painéis: só o CLIENTE vai para a tela nova (fase C). Painéis ficam. */
export function useClienteRedirect(to: string | null): void {
  const router = useRouter();
  const { user, loading } = useAuth() || ({} as any);
  const role = user?.activeRole || user?.role;
  useEffect(() => {
    if (!loading && to && role === 'cliente') router.replace(to);
  }, [loading, to, role, router]);
}
