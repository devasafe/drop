import { useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { WifiOff, PackageSearch, Wallet, Clock, Trophy, User, ChevronRight } from 'lucide-react';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import AuthContext from '../../contexts/AuthContext';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Button } from '../../components/ui/Button';
import { ICON_STROKE_WIDTH } from '../../components/ui/Icon';
import { formatBRL } from '../../components/ui/PriceTag';
import { useToast } from '../../components/ui/Toast';
import { useMotoboyStatus } from '../../hooks/useMotoboyStatus';
import { useDeliveries, useOngoingDeliveries, useDeliveryHistory } from '../../hooks/useSync';
import { earningsToday, deliveriesToday, avgRating } from '../../lib/motoboyOverview';
import { DeliveryOfferCard } from '../../components/motoboy/DeliveryOfferCard';
import OnboardingResumeBanner from '../../components/OnboardingResumeBanner';
import { RoutePoint } from '../../lib/staticMap';
import styles from './MotoboyCockpit.module.css';

const POOL_POLL_MS = 25000;
const SHORTCUTS = [
  { href: '/motoboy/wallet', label: 'Ganhos e saques', icon: Wallet },
  { href: '/motoboy/ongoing?tab=history', label: 'Histórico', icon: Clock },
  { href: '/motoboy/gamification', label: 'Gamificação', icon: Trophy },
  { href: '/motoboy/profile', label: 'Perfil', icon: User },
];

export default function MotoboyPage() {
  const router = useRouter();
  const { user } = useContext(AuthContext);
  const { showToast } = useToast();
  const { online, loading: statusLoading, setOnline } = useMotoboyStatus();
  const { deliveries: pool, loading: poolLoading, setDeliveries: setPool, refetch } = useDeliveries();
  const { deliveries: ongoing } = useOngoingDeliveries();
  const { deliveries: history } = useDeliveryHistory();
  const [accepting, setAccepting] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [self, setSelf] = useState<RoutePoint | null>(null);

  // Posição atual do motoboy p/ o pino nos thumbnails de rota das ofertas.
  // Só quando online (é quando as ofertas aparecem). Baixa frequência basta.
  useEffect(() => {
    if (!online || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setSelf({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [online]);

  // Polling do pool só quando online. Refetch imediato ao ficar online evita
  // esperar até 25s (POOL_POLL_MS) pra ver o pool atualizado.
  useEffect(() => {
    if (!online) return;
    refetch?.();
    const t = setInterval(() => refetch?.(), POOL_POLL_MS);
    return () => clearInterval(t);
  }, [online, refetch]);

  const active = ongoing?.[0] || null;
  const rating = avgRating(history);
  const kpis = [
    { label: 'Ganho hoje', value: formatBRL(earningsToday(history)) },
    { label: 'Entregas hoje', value: String(deliveriesToday(history)) },
    { label: 'Disponíveis', value: online ? String(pool.length) : '—' },
    { label: 'Avaliação', value: rating != null ? `${rating.toFixed(1)} ★` : '—' },
  ];

  const toggle = async () => {
    setToggling(true);
    try { await setOnline(!online); }
    catch { showToast('Não foi possível mudar seu status. Tente de novo.', 'error'); }
    finally { setToggling(false); }
  };

  const claim = async (id: string) => {
    setAccepting(id);
    try {
      const res = await api.post(`/deliveries/${id}/claim`);
      // ?nav=1 → a página da entrega abre a navegação automaticamente.
      router.push(`/motoboy/delivery/${res.data._id}?nav=1`);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        showToast('Essa corrida já foi aceita por outro motoboy.', 'error');
        setPool((prev: any) => prev.filter((d: any) => d._id !== id));
        refetch?.();
      } else {
        showToast(err?.response?.data?.error || 'Falha ao aceitar a corrida.', 'error');
      }
    } finally {
      setAccepting(null);
    }
  };

  const reject = (id: string) => setPool((prev: any) => prev.filter((d: any) => d._id !== id));

  return (
    <ProtectedRoute required_role="motoboy">
      <div className={styles.page}>
        <div className={styles.container}>
          {/* Header de status */}
          <header className={styles.header}>
            <div>
              <h1 className={styles.title}>Olá, {user?.name?.split(' ')[0] || 'Motoboy'}</h1>
              <div className={styles.statusRow}>
                <span className={`${styles.dot} ${online ? styles.dotOn : styles.dotOff}`} />
                <span className={styles.statusText}>{online ? 'Online' : 'Offline'}</span>
              </div>
            </div>
            <Button onClick={toggle} disabled={toggling || statusLoading} variant={online ? 'ghost' : 'primary'}>
              {online ? 'Ficar offline' : 'Ficar online'}
            </Button>
          </header>

          <OnboardingResumeBanner />

          {/* Entrega ativa */}
          {active && (
            <button className={styles.activeCard} onClick={() => router.push('/motoboy/ongoing')}>
              <span className={styles.activeLabel}>Entrega em andamento</span>
              <span className={styles.activeOrder}>Pedido #{(active.orderId || active._id)?.slice(-6)}</span>
              <span className={styles.activeCta}>Ver detalhes →</span>
            </button>
          )}

          {/* KPIs */}
          <div className={styles.kpis}>
            {kpis.map((k) => (
              <div key={k.label} className={styles.kpi}>
                <div className={styles.kpiValue}>{k.value}</div>
                <div className={styles.kpiLabel}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Pool / offline */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Corridas disponíveis</h2>
            {!online ? (
              <EmptyState
                icon={<WifiOff size={22} strokeWidth={ICON_STROKE_WIDTH} />}
                title="Você está offline"
                description="Fique online para receber corridas perto de você."
                action={<Button onClick={toggle} disabled={toggling}>Ficar online</Button>}
              />
            ) : poolLoading ? (
              <div className={styles.list}><Skeleton height={120} /><Skeleton height={120} /></div>
            ) : pool.length === 0 ? (
              <EmptyState
                icon={<PackageSearch size={22} strokeWidth={ICON_STROKE_WIDTH} />}
                title="Nenhuma corrida agora"
                description="Assim que aparecer uma corrida perto, ela surge aqui."
              />
            ) : (
              <div className={styles.list}>
                {pool.map((d: any) => (
                  <DeliveryOfferCard key={d._id} delivery={d} accepting={accepting === d._id}
                    self={self} onAccept={() => claim(d._id)} onReject={() => reject(d._id)} />
                ))}
              </div>
            )}
          </section>

          {/* Atalhos */}
          <section className={styles.section}>
            <div className={styles.shortcuts}>
              {SHORTCUTS.map((s) => {
                const Ico = s.icon;
                return (
                  <button key={s.href} className={styles.shortcut} onClick={() => router.push(s.href)}>
                    <Ico size={18} className={styles.shortcutIcon} aria-hidden="true" />
                    <span className={styles.shortcutLabel}>{s.label}</span>
                    <ChevronRight size={16} className={styles.shortcutChevron} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </ProtectedRoute>
  );
}
