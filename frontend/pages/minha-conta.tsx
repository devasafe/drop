import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { ROUTES } from '../lib/routes';

// O hub de verificações agora vive dentro do perfil (/user-profile e /motoboy/profile).
// Esta rota é mantida por compatibilidade e redireciona pro perfil do papel ativo.
export default function MinhaContaRedirect() {
  const router = useRouter();
  const { user, loading } = useAuth() || ({} as any);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    const role = user.activeRole || user.role;
    router.replace(role === 'motoboy' ? '/motoboy/profile' : role === 'cliente' ? ROUTES.conta : '/user-profile');
  }, [user, loading, router]);

  return <div style={{ minHeight: '100vh', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Redirecionando…</div>;
}
