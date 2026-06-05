import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import api from '../../lib/api';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import styles from './MotoboyPublicProfile.module.css';

export default function MotoboyProfile() {
  const router = useRouter();
  const { id } = router.query;
  const [motoboy, setMotoboy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchMotoboy = async () => {
      try {
        setLoading(true);
        // Buscar como um usuário público primeiro
        const res = await api.get(`/user/public/${id}`);

        // Verificar se tem role motoboy
        if (!res.data.roles?.includes('motoboy')) {
          setError('Este usuário não é um motoboy');
          setMotoboy(null);
          return;
        }

        setMotoboy(res.data);
        setError(null);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Motoboy não encontrado');
        setMotoboy(null);
      } finally {
        setLoading(false);
      }
    };

    fetchMotoboy();
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
        <div className={styles.errorCard}>
          <div className={styles.errorIcon}><Icon name="x-circle" /></div>
          <div className={styles.errorMessage}>{error}</div>
          <button
            onClick={() => router.back()}
            className={styles.btnBack}
          >
            ← Voltar
          </button>
        </div>
      </div>
    );
  }

  if (!motoboy) return null;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Botão Voltar */}
        <button
          onClick={() => router.back()}
          className={styles.btnBack}
        >
          ← Voltar
        </button>

        {/* Card do Perfil */}
        <div className={styles.profileCard}>
          {/* Avatar */}
          <div className={styles.avatar}>
            <Icon name="motorcycle" size={32} />
          </div>

          {/* Nome */}
          <h1 className={styles.name}>
            {motoboy.name}
          </h1>

          {/* Email */}
          <div className={styles.email}>
            {motoboy.email}
          </div>

          {/* Badge Motoboy */}
          <div className={styles.motoboyBadge}>
            <Icon name="motorcycle" size={14} /> Motoboy Profissional
          </div>

          {/* Data de Criação */}
          <div className={styles.memberSince}>
            <div className={styles.memberSinceLabel}>Membro desde</div>
            <div>
              {motoboy.createdAt && new Date(motoboy.createdAt).toLocaleDateString('pt-BR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
