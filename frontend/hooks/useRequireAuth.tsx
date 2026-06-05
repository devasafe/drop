import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';

export default function useRequireAuth(roles?: string[]) {
  const { user, activeRole, loading } = useAuth() || {};
  const router = useRouter();

  useEffect(() => {
    // Se ainda está carregando, não faz nada
    if (loading) return;

    // if no user and no token, redirect to login
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!user && !token) {
      router.replace('/login');
      return;
    }
    if (user && roles && roles.length > 0 && !roles.includes(activeRole || user.activeRole)) {
      router.replace('/');
    }
  }, [user, activeRole, roles, router, loading]);
}
