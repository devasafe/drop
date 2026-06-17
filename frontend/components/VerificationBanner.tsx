import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

const LABELS: Record<string, string> = {
  email: 'verificar email',
  document: 'enviar/aprovar documento',
  facial: 'enviar selfie',
  cnpj: 'informar CNPJ',
  address: 'enviar comprovante de endereço',
  courier: 'enviar CNH e placa',
  owner: 'verificar a conta do dono (email/documento)',
};

/**
 * Aviso global: aparece quando a conta/loja do usuário logado não está verificada,
 * dizendo o que falta e apontando para a página certa.
 */
export default function VerificationBanner() {
  const { user, activeRole } = useAuth();
  const router = useRouter();
  const [missing, setMissing] = useState<string[]>([]);
  const [link, setLink] = useState('/verificacao');
  const [scope, setScope] = useState('Sua conta');

  useEffect(() => {
    let mounted = true;
    const role = activeRole || (user as any)?.activeRole || (user as any)?.role;
    if (!user || router.pathname.startsWith('/verificacao')) { setMissing([]); return; }

    const check = async () => {
      try {
        if (role === 'motoboy') {
          const { data } = await api.get('/verification/motoboy/me');
          const m: string[] = data.missing || [];
          if (mounted) { setMissing(m); setScope('Sua conta de motoboy'); setLink(m.includes('email') || m.includes('document') ? '/verificacao' : '/verificacao-motoboy'); }
        } else if (role === 'lojista') {
          const dash = await api.get('/stores/dashboard').catch(() => null);
          const storeId = dash?.data?.store?._id || dash?.data?._id || dash?.data?.storeId;
          if (!storeId) { if (mounted) setMissing([]); return; }
          const { data } = await api.get(`/verification/store/${storeId}`);
          const m: string[] = data.missing || [];
          // Se falta a conta do dono, manda pra verificação da conta; senão, pra da loja
          if (mounted) { setMissing(m); setScope('Sua loja'); setLink(m.includes('owner') ? '/verificacao' : '/verificacao-loja'); }
        } else {
          const { data } = await api.get('/verification/me');
          if (mounted) { setMissing(data.missing || []); setScope('Sua conta'); setLink('/verificacao'); }
        }
      } catch { if (mounted) setMissing([]); }
    };
    check();
    return () => { mounted = false; };
  }, [user, activeRole, router.pathname]);

  if (missing.length === 0) return null;

  const labels = missing.map(m => LABELS[m] || m).join(', ');
  return (
    <div style={{
      background: '#F59E0B', color: '#1a1a1a', padding: '8px 16px',
      textAlign: 'center', fontSize: 14, fontWeight: 600,
    }}>
      ⚠️ {scope} ainda não está verificada — falta: {labels}.{' '}
      <a href={link} style={{ color: '#1a1a1a', textDecoration: 'underline' }}>Verificar agora →</a>
    </div>
  );
}
