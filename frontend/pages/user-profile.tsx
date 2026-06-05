import Link from 'next/link';
import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import LoadingSkeleton from '../components/LoadingSkeleton';
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
  }, [user, loading, router]);

  if (!user) return (
    <div className={styles.loadingScreen}>
      <LoadingSkeleton variant="form" />
    </div>
  );

  const activeRole = user.activeRole || user.role || 'cliente';

  const infoRows = [
    { label: 'Nome', value: user.name },
    { label: 'Email', value: user.email },
    { label: 'Role Ativo', value: roleLabel(activeRole) },
    { label: 'Roles Disponíveis', value: (user.roles || [user.role]).map(roleLabel).join(', ') || 'Nenhum' },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.container}>

        {/* Back */}
        <Link href="/inicio" className={styles.backLink}>
          ← Início
        </Link>

        {/* Avatar card */}
        <div className={styles.avatarCard}>
          <div className={styles.avatarGlow} />
          <div className={styles.avatar}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <h1 className={styles.userName}>{user.name}</h1>
          <p className={styles.userEmail}>{user.email}</p>
          <div className={styles.roleBadge}>
            {roleLabel(activeRole)}
          </div>
        </div>

        {/* Info table */}
        <div className={styles.infoTable}>
          <div className={styles.infoTableHeader}>
            <h2 className={styles.infoTableTitle}>Informações Pessoais</h2>
          </div>
          {infoRows.map((row, i) => (
            <div key={row.label} className={styles.infoRow}>
              <span className={styles.infoLabel}>{row.label}</span>
              <span className={styles.infoValue}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <Link href="/inicio" className={styles.btnBack}>
            ← Voltar ao Início
          </Link>
          <button onClick={logout} className={styles.btnLogout}>
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
