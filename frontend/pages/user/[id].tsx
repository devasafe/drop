import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import api from '../../lib/api';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import styles from './CustomerView.module.css';

const ROLE_LABELS: Record<string, string> = {
  cliente: 'Cliente',
  customer: 'Cliente',
  lojista: 'Lojista',
  motoboy: 'Motoboy',
  ceo: 'CEO',
  marketing: 'Marketing',
  gerente_geral: 'Gerente Geral',
  gerente_clientes: 'Gerente Clientes',
  gerente_lojistas: 'Gerente Lojistas',
  gerente_motoboys: 'Gerente Motoboys',
};

export default function UserProfile() {
  const router = useRouter();
  const { id } = router.query;
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchUser = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/user/public/${id}`);
        setUser(res.data);
        setError(null);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Usuário não encontrado');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [id]);

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <LoadingSkeleton variant="detail" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorScreen}>
        <div className={styles.errorBox}>
          <div className={styles.errorIcon}><Icon name="x-circle" /></div>
          <div className={styles.errorMessage}>{error}</div>
          <button className={styles.backBtn} onClick={() => router.back()}>
            ← Voltar
          </button>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          ← Voltar
        </button>

        <div className={styles.profileCard}>
          <div className={styles.avatar}>
            {user.name?.charAt(0)?.toUpperCase()}
          </div>

          <h1 className={styles.name}>{user.name}</h1>
          <div className={styles.email}>{user.email}</div>

          {user.roles?.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Tipos de conta</div>
              <div className={styles.roleList}>
                {user.roles.map((role: string) => (
                  <span
                    key={role}
                    className={`${styles.roleChip} ${role === user.activeRole ? styles.roleChipActive : ''}`}
                  >
                    {ROLE_LABELS[role] || role}
                  </span>
                ))}
              </div>
            </div>
          )}

          {user.createdAt && (
            <div className={styles.memberSince}>
              <div className={styles.memberSinceLabel}>Membro desde</div>
              <div className={styles.memberSinceValue}>
                {new Date(user.createdAt).toLocaleDateString('pt-BR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
