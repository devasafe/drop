import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { CUSTOMER_ROUTES, ROUTES } from '../lib/routes';
import { isSellerPanelRoute } from '../lib/sellerRoutes';
import styles from './VerificationBanner.module.css';

const LABELS: Record<string, string> = {
  email: 'verificar email',
  document: 'enviar/aprovar documento',
  facial: 'enviar selfie',
  cnpj: 'informar CNPJ',
  address: 'enviar comprovante de endereço',
  courier: 'enviar CNH e placa',
  asaas: 'conectar a conta Asaas',
  owner: 'verificar a conta do dono (email/documento)',
};

/**
 * Aviso global: aparece quando a conta/loja do usuário logado não está verificada,
 * dizendo o que falta e apontando para a página certa.
 * No painel da loja não aparece: lá o Agora mostra o cadastro (V7, M2).
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
    if (!user || router.pathname.startsWith('/verificacao') || isSellerPanelRoute(router.pathname)) { setMissing((m) => (m.length ? [] : m)); return; }

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

  if (missing.length === 0 || isSellerPanelRoute(router.pathname)) return null;

  // Telas do cliente (DS v2): faixa discreta com tokens. A Conta já tem o Alert próprio.
  if (CUSTOMER_ROUTES.includes(router.pathname)) {
    if (router.pathname === ROUTES.conta) return null;
    return (
      <div role="status" className={styles.customer}>
        <span>Confirme seus dados para comprar</span>
        <a href={link} className={styles.link}>Verificar agora</a>
      </div>
    );
  }

  const labels = missing.map(m => LABELS[m] || m).join(', ');
  return (
    <div role="status" className={styles.customer}>
      <span>{scope} ainda não está verificada. Falta: {labels}.</span>
      <a href={link} className={styles.link}>Verificar agora</a>
    </div>
  );
}
