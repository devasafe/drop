import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { User, ShieldCheck, Bell, MapPin, LogOut, ChevronRight, ChevronLeft, Star, Package, MessageSquare, Megaphone } from 'lucide-react';
import api from '../lib/api';
import { imageUrl } from '../lib/config';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../hooks/useSync';
import LoadingSkeleton from '../components/LoadingSkeleton';
import StoreRatingsBlock from '../components/StoreRatingsBlock';
import MeusDadosForm from '../components/MeusDadosForm';
import VerificationHub from '../components/VerificationHub';
import AddressManager from '../components/AddressManager';
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

type SectionKey = 'dados' | 'verificacao' | 'notificacoes' | 'enderecos' | 'avaliacoes';

const notifIcon = (type: string) => {
  if (type === 'order') return <Package size={17} />;
  if (type === 'chat') return <MessageSquare size={17} />;
  if (type === 'broadcast') return <Megaphone size={17} />;
  return <Bell size={17} />;
};
const notifTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'Agora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min atrás`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h atrás`;
  return new Date(dateStr).toLocaleDateString('pt-BR');
};

/**
 * Conta do cliente — layout de "configurações" em 2 painéis no desktop: rail
 * esquerdo (identidade + menu + Sair) e painel direito com a seção ativa
 * (Meus dados, Verificações, Notificações, Endereços). No mobile vira um
 * drill-in: o menu ocupa a tela e cada item abre a seção com um botão voltar.
 */
export default function UserProfile() {
  const { user, logout, loading } = useAuth() || {};
  const router = useRouter();
  const [store, setStore] = useState<any>(null);
  const [verifOk, setVerifOk] = useState<boolean | null>(null);
  const [active, setActive] = useState<SectionKey | null>(null);
  const { notifications: rawNotifications } = useNotifications();

  const activeRoleEarly = user?.activeRole || user?.role;
  const isLojista = activeRoleEarly === 'lojista' || activeRoleEarly === 'seller';

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    if (!loading && user && (user.activeRole || user.role) === 'motoboy') router.replace('/motoboy/profile');
  }, [user, loading, router]);

  // Desktop começa com uma seção aberta; mobile começa no menu (drill-in).
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 900) setActive('dados');
  }, []);

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

  // Marca notificações como lidas ao abrir a seção.
  useEffect(() => {
    if (active === 'notificacoes' && user) api.patch('/notifications/read-all').catch(() => {});
  }, [active, user]);

  if (!user) return (
    <div className={styles.loadingScreen}>
      <LoadingSkeleton variant="form" />
    </div>
  );

  const activeRole = user.activeRole || user.role || 'cliente';

  const sections: { key: SectionKey; icon: JSX.Element; label: string; status?: boolean | null }[] = [
    { key: 'dados', icon: <User size={19} />, label: 'Meus dados' },
    { key: 'verificacao', icon: <ShieldCheck size={19} />, label: 'Verificações e segurança', status: verifOk },
    { key: 'notificacoes', icon: <Bell size={19} />, label: 'Notificações' },
    { key: 'enderecos', icon: <MapPin size={19} />, label: 'Endereços' },
    ...(isLojista && store?._id ? [{ key: 'avaliacoes' as SectionKey, icon: <Star size={19} />, label: 'Avaliações da loja' }] : []),
  ];

  const notifications = (rawNotifications ?? []).filter((n: any) => typeof n?._id === 'string').slice(0, 20);
  const sectionTitle = sections.find((s) => s.key === active)?.label ?? '';

  const renderSection = () => {
    switch (active) {
      case 'dados':
        return <MeusDadosForm />;
      case 'verificacao':
        return <VerificationHub />;
      case 'enderecos':
        return <AddressManager />;
      case 'avaliacoes':
        return store?._id ? (
          <Card className={styles.ratingsWrap}><StoreRatingsBlock storeId={String(store._id)} /></Card>
        ) : null;
      case 'notificacoes':
        return notifications.length === 0 ? (
          <p className={styles.notifEmpty}>Nenhuma notificação por aqui.</p>
        ) : (
          <div className={styles.notifList}>
            {notifications.map((n: any) => (
              <div key={n._id} className={`${styles.notifItem} ${!n.read ? styles.notifUnread : ''}`}>
                <span className={styles.notifIcon}>{notifIcon(n.type)}</span>
                <div className={styles.notifBody}>
                  {n.title && <p className={styles.notifTitle}>{n.title}</p>}
                  <p className={styles.notifMsg}>{n.message}</p>
                  <span className={styles.notifTime}>{notifTime(n.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={styles.page}>
      <div className={`${styles.container} ${active ? styles.hasActive : ''}`}>
        {/* Rail: identidade + menu + sair */}
        <aside className={styles.rail}>
          <header className={styles.header}>
            <div className={styles.avatar}>
              {user.photo ? (
                <img src={imageUrl(user.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className={styles.headInfo}>
              <h1 className={styles.userName}>{user.name}</h1>
              <p className={styles.userEmail}>{user.email}</p>
            </div>
            <span className={styles.roleChip}>{roleLabel(activeRole)}</span>
          </header>

          <div className={styles.list}>
            {sections.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`${styles.row} ${active === s.key ? styles.rowActive : ''}`}
                onClick={() => setActive(s.key)}
              >
                <span className={styles.rowIcon}>{s.icon}</span>
                <span className={styles.rowLabel}>{s.label}</span>
                {'status' in s && s.status !== null && s.status !== undefined && (
                  <span className={s.status ? styles.statusOk : styles.statusPend}>
                    {s.status ? 'Verificada' : 'Pendente'}
                  </span>
                )}
                <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
              </button>
            ))}
          </div>

          <button type="button" className={styles.logoutRow} onClick={logout}>
            <span className={styles.rowIcon}><LogOut size={18} aria-hidden="true" /></span>
            <span className={styles.rowLabel}>Sair</span>
          </button>
        </aside>

        {/* Painel da seção ativa */}
        <section className={styles.pane}>
          <div className={styles.paneHead}>
            <button type="button" className={styles.backBtn} onClick={() => setActive(null)} aria-label="Voltar">
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <h2 className={styles.paneTitle}>{sectionTitle}</h2>
          </div>
          {renderSection()}
        </section>
      </div>
    </div>
  );
}
