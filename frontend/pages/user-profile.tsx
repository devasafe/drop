import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { User, ShieldCheck, Bell, MapPin, LogOut, ChevronRight } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import LoadingSkeleton from '../components/LoadingSkeleton';
import StoreRatingsBlock from '../components/StoreRatingsBlock';
import { Card } from '../components/ui/Card';
import styles from './UserProfile.module.css';

const roleLabel = (role: string) => {
  switch (role) {
    case 'cliente': return 'Cliente';
    case 'lojista': return 'Lojista';
    case 'motoboy': return 'Motoboy';
    case 'ceo': return 'CEO';
    case 'admin': return 'Admin';
    default: return role;
  }
};

/**
 * Conta do cliente — hub enxuto: cabeçalho (avatar/nome) + lista de atalhos
 * (Meus dados, Verificações, Notificações, Endereços) + Sair. Os formulários
 * moram nas próprias páginas (/editar-conta, /verificacao, etc.), então aqui
 * não empilha card de form. Lojista ganha o bloco de avaliações da loja.
 */
export default function UserProfile() {
  const { user, logout, loading } = useAuth() || {};
  const router = useRouter();
  const [store, setStore] = useState<any>(null);
  const [verifOk, setVerifOk] = useState<boolean | null>(null);

  const activeRoleEarly = user?.activeRole || user?.role;
  const isLojista = activeRoleEarly === 'lojista' || activeRoleEarly === 'seller';

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    // Motoboy tem a sua própria página de perfil (com avaliações).
    if (!loading && user && (user.activeRole || user.role) === 'motoboy') router.replace('/motoboy/profile');
  }, [user, loading, router]);

  useEffect(() => {
    if (!isLojista) return;
    api.get('/stores/dashboard').then(({ data }) => setStore(data?.store || data)).catch(() => {});
  }, [isLojista]);

  useEffect(() => {
    if (!user) return;
    api.get('/verification/me')
      .then(({ data }) => {
        const emailOk = data?.verification?.email?.status === 'verified';
        const docOk = data?.verification?.document?.status === 'approved';
        setVerifOk(Boolean(emailOk && docOk));
      })
      .catch(() => setVerifOk(null));
  }, [user]);

  if (!user) return (
    <div className={styles.loadingScreen}>
      <LoadingSkeleton variant="form" />
    </div>
  );

  const activeRole = user.activeRole || user.role || 'cliente';

  const rows = [
    { icon: <User size={19} />, label: 'Meus dados', onClick: () => router.push('/editar-conta') },
    {
      icon: <ShieldCheck size={19} />,
      label: 'Verificações e segurança',
      status: verifOk,
      onClick: () => router.push('/verificacao'),
    },
    { icon: <Bell size={19} />, label: 'Notificações', onClick: () => router.push('/notifications') },
    { icon: <MapPin size={19} />, label: 'Endereços', onClick: () => router.push('/user-dashboard?tab=addresses') },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.avatar}>{user.name.charAt(0).toUpperCase()}</div>
          <div className={styles.headInfo}>
            <h1 className={styles.userName}>{user.name}</h1>
            <p className={styles.userEmail}>{user.email}</p>
          </div>
          <span className={styles.roleChip}>{roleLabel(activeRole)}</span>
        </header>

        <div className={styles.list}>
          {rows.map((r) => (
            <button key={r.label} type="button" className={styles.row} onClick={r.onClick}>
              <span className={styles.rowIcon}>{r.icon}</span>
              <span className={styles.rowLabel}>{r.label}</span>
              {'status' in r && r.status !== null && r.status !== undefined && (
                <span className={r.status ? styles.statusOk : styles.statusPend}>
                  {r.status ? 'Verificada' : 'Pendente'}
                </span>
              )}
              <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
            </button>
          ))}
        </div>

        {isLojista && store?._id && (
          <>
            <h2 className={styles.sectionTitle}>Avaliações da loja</h2>
            <Card className={styles.ratingsWrap}>
              <StoreRatingsBlock storeId={String(store._id)} />
            </Card>
          </>
        )}

        <button type="button" className={styles.logoutRow} onClick={logout}>
          <span className={styles.rowIcon}><LogOut size={18} aria-hidden="true" /></span>
          <span className={styles.rowLabel}>Sair</span>
        </button>
      </div>
    </div>
  );
}
