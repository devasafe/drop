import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';

// O hub de verificações agora vive dentro do perfil (/user-profile e /motoboy/profile).
// Esta rota é mantida por compatibilidade e redireciona pro perfil do papel ativo.
export default function MinhaContaRedirect() {
  const router = useRouter();
  const { user, loading } = useAuth() || ({} as any);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    const role = user.activeRole || user.role;
    router.replace(role === 'motoboy' ? '/motoboy/profile' : '/user-profile');
  }, [user, loading, router]);

  return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Redirecionando…</div>;
}
