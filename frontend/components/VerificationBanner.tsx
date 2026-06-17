import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

/**
 * Aviso global: aparece quando a conta/loja do usuário logado não está verificada.
 * Não aparece nas próprias páginas de verificação.
 */
export default function VerificationBanner() {
  const { user, activeRole } = useAuth();
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [link, setLink] = useState('/verificacao');

  useEffect(() => {
    let mounted = true;
    const role = activeRole || (user as any)?.activeRole || (user as any)?.role;

    if (!user || router.pathname.startsWith('/verificacao')) { setShow(false); return; }

    const check = async () => {
      try {
        if (role === 'motoboy') {
          const { data } = await api.get('/verification/motoboy/me');
          if (mounted) { setLink('/verificacao-motoboy'); setShow(!data.verified); }
        } else if (role === 'lojista') {
          const dash = await api.get('/stores/dashboard').catch(() => null);
          const storeId = dash?.data?.store?._id || dash?.data?._id || dash?.data?.storeId;
          if (!storeId) { if (mounted) setShow(false); return; }
          const { data } = await api.get(`/verification/store/${storeId}`);
          if (mounted) { setLink('/verificacao-loja'); setShow(!data.isVerified); }
        } else {
          const { data } = await api.get('/verification/me');
          if (mounted) { setLink('/verificacao'); setShow(!data.verified); }
        }
      } catch { if (mounted) setShow(false); }
    };
    check();
    return () => { mounted = false; };
  }, [user, activeRole, router.pathname]);

  if (!show) return null;

  return (
    <div style={{
      background: '#F59E0B', color: '#1a1a1a', padding: '8px 16px',
      textAlign: 'center', fontSize: 14, fontWeight: 600,
    }}>
      ⚠️ Sua conta ainda não está verificada — verifique para liberar todos os recursos.{' '}
      <a href={link} style={{ color: '#1a1a1a', textDecoration: 'underline' }}>Verificar agora →</a>
    </div>
  );
}
