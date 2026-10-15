import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { UserX } from 'lucide-react';
import MotoboyShell from '../panel/MotoboyShell';
import blocks from '../../panel/PanelBlocks.module.css';
import { ScreenHeader } from '../../drop/ScreenHeader';
import { Avatar } from '../../ui/Avatar';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { useAuth } from '../../../contexts/AuthContext';
import api from '../../../lib/api';
import { monthYear, shortName } from '../../../lib/motoboyLevel';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';
import styles from './PerfilPublico.module.css';

/** Perfil público do motoboy (protótipo 26): só o que a rota pública devolve, sem PII. Sempre claro. */
export function PerfilPublicoScreen() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const { user, loading: authLoading } = useAuth() || ({} as any);
  const [data, setData] = useState<{ name: string; createdAt?: string } | null>(null);
  const [error, setError] = useState<{ text: string; retry: boolean } | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    setData(null);
    api.get(`/user/public/${encodeURIComponent(id)}`)
      .then((r) => {
        const roles = Array.isArray(r.data?.roles) ? r.data.roles : [];
        if (!roles.includes('motoboy')) setError({ text: 'Este perfil não é de um entregador.', retry: false });
        else setData({ name: String(r.data?.name || ''), createdAt: r.data?.createdAt });
      })
      .catch((e) => setError(e?.response?.status === 404
        ? { text: 'Entregador não encontrado.', retry: false }
        : { text: 'Não carregamos este perfil.', retry: true }));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const role = user?.activeRole || user?.role;
  const isSelf = !!user && role === 'motoboy' && String(user.id || user._id) === id;
  const since = data ? monthYear(data.createdAt) : null;
  const nome = data ? shortName(data.name) : '';

  const body = error ? (
    error.retry
      ? <EmptyState variant="error" icon={<UserX />} title={error.text} onRetry={load} />
      : <EmptyState icon={<UserX />} title={error.text} />
  ) : !data ? (
    <><Skeleton height={160} radius="var(--radius-lg)" /><Skeleton height={72} radius="var(--radius-lg)" /></>
  ) : (
    <>
      <section className={[blocks.blk, styles.hero].join(' ')} aria-label="Entregador">
        <Avatar name={nome} size="lg" />
        <h2 className={styles.name}>{nome}</h2>
        <div className={[blocks.chips, styles.centerChips].join(' ')}>
          <span className={[blocks.tag, blocks.tagBrand].join(' ')}>Entregador DROP</span>
          <span className={blocks.tag}>Moto</span>
        </div>
      </section>
      {since && (
        <div className={blocks.kpis}>
          <div className={blocks.kpi}><small>Na DROP desde</small><b>{since}</b></div>
        </div>
      )}
      <p className={[blocks.meta, styles.center].join(' ')}>Por segurança, placa e telefone só aparecem durante a sua entrega.</p>
    </>
  );

  if (authLoading) return <main className={styles.page}><div className={styles.stack}><Skeleton height={160} radius="var(--radius-lg)" /></div></main>;
  if (isSelf) {
    return (
      <MotoboyShell title="Seu entregador" back={MOTOBOY_ROUTES.perfil}>
        <div className={blocks.body}>{body}</div>
      </MotoboyShell>
    );
  }
  return (
    <main className={styles.page}>
      <ScreenHeader title="Seu entregador" onBack={() => router.back()} />
      <div className={styles.stack}>{body}</div>
    </main>
  );
}

export default PerfilPublicoScreen;
