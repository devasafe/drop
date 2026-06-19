import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import LoadingSkeleton from '../components/LoadingSkeleton';
import MeusDadosForm from '../components/MeusDadosForm';
import VerificationHub from '../components/VerificationHub';
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

export default function UserProfile() {
  const { user, logout, loading } = useAuth() || {};
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    // Motoboy tem a sua própria página de perfil (com avaliações).
    if (!loading && user && (user.activeRole || user.role) === 'motoboy') router.replace('/motoboy/profile');
  }, [user, loading, router]);

  if (!user) return (
    <div className={styles.loadingScreen}>
      <LoadingSkeleton variant="form" />
    </div>
  );

  const activeRole = user.activeRole || user.role || 'cliente';

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Avatar card */}
        <div className={styles.avatarCard}>
          <div className={styles.avatarGlow} />
          <div className={styles.avatar}>{user.name.charAt(0).toUpperCase()}</div>
          <h1 className={styles.userName}>{user.name}</h1>
          <p className={styles.userEmail}>{user.email}</p>
          <div className={styles.roleBadge}>{roleLabel(activeRole)}</div>
        </div>

        {/* Verificações e recebimento */}
        <h2 style={sectionTitle}>Verificações e recebimento</h2>
        <VerificationHub />

        {/* Meus dados */}
        <h2 style={{ ...sectionTitle, marginTop: 28 }}>Meus dados</h2>
        <MeusDadosForm />

        {/* Sair */}
        <button onClick={logout} className={styles.btnLogout} style={{ marginTop: 24, width: '100%' }}>
          Sair
        </button>
      </div>
    </div>
  );
}

const sectionTitle: React.CSSProperties = { fontFamily: 'Space Grotesk, sans-serif', fontSize: 18, color: 'rgba(255,255,255,0.92)', margin: '24px 0 4px' };
