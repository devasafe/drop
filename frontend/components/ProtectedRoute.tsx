import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  required_role?: string | string[];
  children: React.ReactNode;
}

export default function ProtectedRoute({ required_role, children }: ProtectedRouteProps) {
  const auth = useAuth();
  const { user, loading } = auth || { user: null, loading: true };
  const router = useRouter();
  const activeRole = user?.activeRole || user?.role;

  useEffect(() => {
    // Se ainda está carregando, não faz nada
    if (loading) {
      console.log('ProtectedRoute: Carregando contexto de autenticação...');
      return;
    }

    console.log('ProtectedRoute: Verificando acesso');
    console.log('  - Usuário:', user ? `${user.name} (${user.email})` : 'NÃO LOGADO');
    console.log('  - Role ativo:', activeRole);
    console.log('  - Role requerido:', required_role);

    if (!user) {
      console.log('  → Redirecionando para /login');
      router.push('/login');
      return;
    }

    if (required_role) {
      // Converte string separada por vírgula em array
      const allowedRoles = typeof required_role === 'string' 
        ? required_role.split(',').map(r => r.trim()) 
        : required_role;
      
      if (!allowedRoles.includes(activeRole)) {
        console.log('  → Acesso negado. Redirecionando para /access-denied');
        router.push('/access-denied');
        return;
      }
      console.log('  Acesso permitido');
    }
  }, [user, activeRole, required_role, router, loading]);

  // Se está carregando, mostra spinner
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '16px',
        color: '#6b7280',
      }}>
        Carregando autenticação...
      </div>
    );
  }

  // Se não está autenticado ou sem permissão, retorna null (redirecionamento acontece no useEffect)
  if (!user) {
    return null;
  }

  if (required_role) {
    const allowedRoles = typeof required_role === 'string' 
      ? required_role.split(',').map(r => r.trim()) 
      : required_role;
    
    if (!allowedRoles.includes(activeRole)) {
      return null;
    }
  }

  // Renderiza o conteúdo protegido
  return <>{children}</>;
}
