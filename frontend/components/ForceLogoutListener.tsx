import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';

/**
 * Escuta o evento 'auth:force_logout' emitido pelo backend quando um admin
 * bloqueia ou desconecta manualmente o usuario. Limpa credenciais locais e
 * redireciona para /login.
 *
 * Best-effort: se o user estiver offline, o evento se perde — mas o login
 * continua bloqueado pelo status='blocked' no backend.
 */
export default function ForceLogoutListener() {
  const { on } = useSocket();
  const { logout, token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!token) return;

    const unsubscribe = on('auth:force_logout', (payload: any) => {
      const message = payload?.message || 'Sua sessao foi encerrada.';
      console.warn('[ForceLogout]', payload?.reason, message);
      try {
        if (typeof window !== 'undefined') {
          // Guardar motivo para exibir na tela de login
          sessionStorage.setItem('force_logout_message', message);
        }
      } catch {
        /* ignore */
      }
      logout();
      router.replace('/login');
    });

    return unsubscribe;
  }, [on, logout, router, token]);

  return null;
}
