import { useContext, useEffect } from 'react';
import { useRouter } from 'next/router';
import AuthContext from '../contexts/AuthContext';
import { helpRouteFor } from '../lib/helpRoute';
import { ROUTES } from '../lib/routes';

/**
 * A antiga página escura de suporte saiu: cliente, loja e motoboy têm a Ajuda dentro do próprio
 * painel (com o chat do chamado). Links antigos para /suporte continuam valendo e só redirecionam.
 */
export default function SuportePage() {
  const router = useRouter();
  const { user, loading } = useContext(AuthContext) || ({} as any);
  const role = user?.activeRole || user?.role;
  useEffect(() => {
    if (loading) return;
    router.replace(user ? helpRouteFor(role) : ROUTES.login);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, role]);
  return null;
}
