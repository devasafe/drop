import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import ProtectedRoute from '../../components/ProtectedRoute';
import StatCard from '../../components/analytics/StatCard';
import ChartCard from '../../components/analytics/ChartCard';
import PeriodFilter from '../../components/analytics/PeriodFilter';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import {
  platformAnalytics,
  type Period,
  type PlatformOverview,
  type UserGrowthPoint,
  type OrdersTimelinePoint,
  type FunnelData,
  type TopStore,
  type CategoryRow,
  type RetentionCohort,
} from '../../lib/analyticsApi';
import {
  LineChart,
  Line,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import styles from './AdminAnalytics.module.css';

// Carregar o mapa só no client (Google Maps depende de window)
const LiveUsersMap = dynamic(() => import('../../components/analytics/LiveUsersMap'), {
  ssr: false,
  loading: () => <div className={styles.mapLoading}>Carregando mapa...</div>,
});

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const NUM = (v: number) => new Intl.NumberFormat('pt-BR').format(v || 0);

const COLORS = ['#6C2BD9', '#8B5CF6', '#38BDF8', '#22C55E', '#F59E0B', '#EC4899', '#EF4444', '#14B8A6'];

function CeoAnalyticsInner() {
  const [period, setPeriod] = useState<Period>('30d');
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [userGrowth, setUserGrowth] = useState<UserGrowthPoint[]>([]);
  const [ordersTimeline, setOrdersTimeline] = useState<OrdersTimelinePoint[]>([]);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [topStores, setTopStores] = useState<TopStore[]>([]);
  const [topCategories, setTopCategories] = useState<CategoryRow[]>([]);
  const [retention, setRetention] = useState<RetentionCohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      platformAnalytics.overview(period),
      platformAnalytics.userGrowth(period),
      platformAnalytics.ordersTimeline(period),
      platformAnalytics.funnel(period),
      platformAnalytics.topStores(period, 15),
      platformAnalytics.topCategories(period),
      platformAnalytics.retention(period),
    ])
      .then(([ov, ug, ot, fn, ts, tc, rt]) => {
        if (cancelled) return;
        setOverview(ov);
        setUserGrowth(ug.timeline);
        setOrdersTimeline(ot.timeline);
        setFunnel(fn);
        setTopStores(ts.stores);
        setTopCategories(tc.categories);
        setRetention(rt.cohorts);
      })
      .catch(err => {
        console.error('[admin/analytics] load error:', err);
        if (!cancelled) setError('Erro ao carregar analytics.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [period]);

  const insights = useMemo(() => {
    if (!overview) return [];
    const list: string[] = [];

    if (overview.delta.newUsers > 20) {
      list.push(`Crescimento de ${overview.delta.newUsers.toFixed(1)}% em novos cadastros. Aproveite para testar campanhas de ativação.`);
    } else if (overview.delta.newUsers < -10) {
      list.push(`Novos cadastros caíram ${Math.abs(overview.delta.newUsers).toFixed(1)}%. Revise canais de aquisição.`);
    }

    if (funnel && funnel.conversionRates.registerToFirstOrder < 30) {
      list.push(`Apenas ${funnel.conversionRates.registerToFirstOrder.toFixed(0)}% dos novos usuários fazem o primeiro pedido. Considere onboarding + cupom de boas-vindas.`);
    }

    if (funnel && funnel.conversionRates.firstOrderToSecond < 40 && funnel.conversionRates.firstOrderToSecond > 0) {
      list.push(`Taxa de retorno em ${funnel.conversionRates.firstOrderToSecond.toFixed(0)}%. Invista em remarketing e notificações pós-compra.`);
    }

    if (overview.delta.gmv > 15) {
      list.push(`GMV cresceu ${overview.delta.gmv.toFixed(1)}% — comissão acompanhou em ${overview.delta.commission.toFixed(1)}%.`);
    }

    if (topStores.length > 0 && topStores[0].revenue > 0) {
      const top = topStores[0];
      const totalTop5 = topStores.slice(0, 5).reduce((s, t) => s + t.revenue, 0);
      const pctTop5 = overview.current.gmv > 0 ? (totalTop5 / overview.current.gmv) * 100 : 0;
      if (pctTop5 > 60) {
        list.push(`Top 5 lojas concentram ${pctTop5.toFixed(0)}% do GMV. Risco de concentração — estimule o long tail.`);
      }
      list.push(`Maior loja do período: "${top.name}" com ${BRL(top.revenue)}.`);
    }

    return list;
  }, [overview, funnel, topStores]);

  if (loading && !overview) {
    return <LoadingSkeleton variant="dashboard" />;
  }
  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  return (
    <>
      <Head>
        <title>Analytics · CEO · DROP</title>
      </Head>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.title}>Analytics da Plataforma</h1>
            <p className={styles.subtitle}>Avalie a saúde do app e descubra onde crescer</p>
          </div>
          <PeriodFilter value={period} onChange={setPeriod} />
        </header>

        {overview && (
          <div className={styles.kpiGrid}>
            <StatCard
              label="Usuários totais"
              value={NUM(overview.current.totalUsers)}
              icon={<Icon name="users" size={16} />}
              variant="purple"
              hint={`${overview.current.totalStores} lojas`}
            />
            <StatCard
              label="Novos no período"
              value={NUM(overview.current.newUsers)}
              delta={overview.delta.newUsers}
              icon={<Icon name="plus" size={16} />}
              variant="pink"
            />
            <StatCard
              label="Usuários ativos"
              value={NUM(overview.current.activeUsers)}
              delta={overview.delta.activeUsers}
              icon={<Icon name="zap" size={16} />}
              variant="blue"
              hint="Fizeram pedido"
            />
            <StatCard
              label="GMV"
              value={BRL(overview.current.gmv)}
              delta={overview.delta.gmv}
              icon={<Icon name="money" size={16} />}
              variant="green"
            />
            <StatCard
              label="Comissão DROP"
              value={BRL(overview.current.commission)}
              delta={overview.delta.commission}
              icon={<Icon name="bank" size={16} />}
              variant="orange"
            />
          </div>
        )}

        {insights.length > 0 && (
          <section className={styles.insightsBox}>
            <h3 className={styles.insightsTitle}><Icon name="target" size={16} /> Recomendações estratégicas</h3>
            <ul className={styles.insightsList}>
              {insights.map((txt, i) => (
                <li key={i}>{txt}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Crescimento de usuários */}
        <ChartCard title="Crescimento de usuários" subtitle="Novos cadastros por dia, por tipo">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={userGrowth}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={11} tickFormatter={d => d.slice(5)} />
              <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} />
              <Tooltip
                contentStyle={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }}
              />
              <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
              <Line type="monotone" dataKey="clientes" stroke="#6C2BD9" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="lojistas" stroke="#22C55E" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="motoboys" stroke="#F59E0B" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Pedidos + GMV */}
        <ChartCard title="Pedidos e GMV" subtitle="Evolução diária">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={ordersTimeline}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={11} tickFormatter={d => d.slice(5)} />
              <YAxis yAxisId="left" stroke="rgba(255,255,255,0.4)" fontSize={11} />
              <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.4)" fontSize={11} />
              <Tooltip
                contentStyle={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }}
                formatter={(v: any, key: any) => (key === 'gmv' ? BRL(v) : v)}
              />
              <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="orders" name="Pedidos" fill="#38BDF8" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="gmv" name="GMV" stroke="#6C2BD9" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Live Map */}
        <ChartCard title="Usuários ao vivo" subtitle="Quem está usando o app agora">
          <LiveUsersMap />
        </ChartCard>

        {/* Funnel + Retenção */}
        <div className={styles.grid2}>
          <ChartCard title="Funil de conversão" subtitle="Cadastro → primeiro pedido → recorrência">
            {funnel ? (
              <div className={styles.funnel}>
                {funnel.steps.map((s, i) => {
                  const pct = i === 0 ? 100 : funnel.steps[0].count > 0 ? (s.count / funnel.steps[0].count) * 100 : 0;
                  return (
                    <div key={s.label} className={styles.funnelRow}>
                      <div className={styles.funnelLabel}>{s.label}</div>
                      <div className={styles.funnelBarWrap}>
                        <div
                          className={styles.funnelBar}
                          style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }}
                        />
                        <span className={styles.funnelCount}>
                          {NUM(s.count)} <small>({pct.toFixed(1)}%)</small>
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div className={styles.funnelStats}>
                  <div>
                    <span>Cadastro → 1º pedido</span>
                    <strong>{funnel.conversionRates.registerToFirstOrder.toFixed(1)}%</strong>
                  </div>
                  <div>
                    <span>1º → 2º pedido</span>
                    <strong>{funnel.conversionRates.firstOrderToSecond.toFixed(1)}%</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.empty}>Sem dados.</div>
            )}
          </ChartCard>

          <ChartCard title="Retenção por cohort" subtitle="% de usuários que voltaram a pedir">
            {retention.length === 0 ? (
              <div className={styles.empty}>Ainda não há cohorts suficientes.</div>
            ) : (
              <div className={styles.cohortTable}>
                <div className={styles.cohortHeader}>
                  <div>Cohort</div>
                  <div>Tamanho</div>
                  <div>M+0</div>
                  <div>M+1</div>
                  <div>M+2</div>
                  <div>M+3</div>
                </div>
                {retention.map(c => (
                  <div key={c.cohort} className={styles.cohortRow}>
                    <div>{c.cohort}</div>
                    <div>{c.size}</div>
                    {[0, 1, 2, 3].map(offset => {
                      const v = c.retention[offset] || 0;
                      return (
                        <div
                          key={offset}
                          className={styles.cohortCell}
                          style={{ background: `rgba(108,43,217,${0.08 + (v / 100) * 0.7})` }}
                        >
                          {v.toFixed(0)}%
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </ChartCard>
        </div>

        {/* Top Lojas + Top Categorias */}
        <div className={styles.grid2}>
          <ChartCard title="Top lojas" subtitle="Ranking por receita">
            {topStores.length === 0 ? (
              <div className={styles.empty}>Sem dados.</div>
            ) : (
              <div className={styles.storeList}>
                {topStores.map((s, i) => (
                  <div key={s._id} className={styles.storeRow}>
                    <span className={styles.storeRank}>#{i + 1}</span>
                    <div className={styles.storeInfo}>
                      <div className={styles.storeName}>{s.name || 'Loja'}</div>
                      <div className={styles.storeMeta}>
                        {s.city || '—'} · {s.orders} pedidos · ticket {BRL(s.avgTicket)}
                      </div>
                    </div>
                    <div className={styles.storeRevenue}>{BRL(s.revenue)}</div>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Categorias mais vendidas" subtitle="Na plataforma inteira">
            {topCategories.length === 0 ? (
              <div className={styles.empty}>Sem dados.</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={topCategories}
                    dataKey="revenue"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={55}
                    paddingAngle={2}
                  >
                    {topCategories.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }}
                    formatter={(v: any) => BRL(v)}
                  />
                  <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </div>
    </>
  );
}

export default function CeoAnalyticsPage() {
  return (
    <ProtectedRoute required_permission="analytics:view_platform">
      <CeoAnalyticsInner />
    </ProtectedRoute>
  );
}
