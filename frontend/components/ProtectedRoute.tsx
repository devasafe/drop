import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  required_role?: string | string[];
  /**
   * Permissão(ões) exigida(s). Se informado, o acesso é liberado quando o usuário
   * tem QUALQUER uma delas (ou é CEO, que tem acesso total). É o mecanismo alinhado
   * ao painel /admin/permissoes. Pode coexistir com required_role (basta satisfazer um).
   */
  required_permission?: string | string[];
  children: React.ReactNode;
}

function toArray(v?: string | string[]): string[] {
  if (!v) return [];
  return typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v;
}

export default function ProtectedRoute({ required_role, required_permission, children }: ProtectedRouteProps) {
  const auth = useAuth();
  const { user, loading, permissionsLoading, can } = auth || ({} as any);
  const router = useRouter();
  const activeRole = user?.activeRole || user?.role;

  const allowedRoles = toArray(required_role);
  const allowedPerms = toArray(required_permission);
  const hasRequirement = allowedRoles.length > 0 || allowedPerms.length > 0;

  // Precisamos esperar as permissões carregarem antes de decidir, quando o gate é por permissão.
  const waitingPermissions = allowedPerms.length > 0 && permissionsLoading;

  const roleAllowed = allowedRoles.length > 0 && allowedRoles.includes(activeRole);
  const permAllowed = allowedPerms.length > 0 && allowedPerms.some((p) => can?.(p));
  const granted = !hasRequirement || roleAllowed || permAllowed;

  useEffect(() => {
    if (loading || waitingPermissions) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (hasRequirement && !granted) {
      router.push('/access-denied');
    }
  }, [user, loading, waitingPermissions, hasRequirement, granted, router]);

  if (loading || waitingPermissions) {
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

  if (!user) return null;
  if (hasRequirement && !granted) return null;

  return <>{children}</>;
}
