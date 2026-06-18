import { useEffect, useState, useMemo } from 'react';
import Head from 'next/head';
import ProtectedRoute from '../../components/ProtectedRoute';
import StatCard from '../../components/analytics/StatCard';
import ChartCard from '../../components/analytics/ChartCard';
import PeriodFilter from '../../components/analytics/PeriodFilter';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import api from '../../lib/api';
import Icon from '../../components/Icon';
import {
  storeAnalytics,
  type Period,
  type DateRange,
  type StoreOverview,
  type TimelinePoint,
  type TopProduct,
  type CategoryRow,
  type PeakHourCell,
  type PaymentMethodRow,
  type CustomerInsights,
} from '../../lib/analyticsApi';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import styles from './Analytics.module.css';

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const PAYMENT_LABELS: Record<string, string> = {
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  pix: 'Pix',
  money: 'Dinheiro',
  cash_on_delivery: 'Pagar na entrega',
  unknown: 'Não informado',
};

const DAYS_PT = ['', 'Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const COLORS = ['#6C2BD9', '#8B5CF6', '#38BDF8', '#22C55E', '#F59E0B', '#EC4899', '#EF4444', '#14B8A6'];

function SellerAnalyticsInner() {
  const [period, setPeriod] = useState<Period>('30d');
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });
  const [overview, setOverview] = useState<StoreOverview | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [peakHours, setPeakHours] = useState<PeakHourCell[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [customerInsights, setCustomerInsights] = useState<CustomerInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [general, setGeneral] = useState<{ totalSales: number; delivered: number; ongoing: number; revenue: number } | null>(null);

  // Resumo geral (todos os tempos) — antes ficava na aba "Métricas" do painel
  useEffect(() => {
    let cancelled = false;
    api.get('/stores/dashboard')
      .then(({ data }) => { if (!cancelled) setGeneral(data.metrics || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const customIncomplete = period === 'custom' && (!range.from || !range.to);

  useEffect(() => {
    if (customIncomplete) return; // espera as duas datas serem escolhidas
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      storeAnalytics.overview(period, range),
      storeAnalytics.salesTimeline(period, range),
      storeAnalytics.topProducts(period, 10, range),
      storeAnalytics.topCategories(period, range),
      storeAnalytics.peakHours(period, range),
      storeAnalytics.paymentMethods(period, range),
      storeAnalytics.customerInsights(period, range),
    ])
      .then(([ov, tl, tp, cat, ph, pm, ci]) => {
        if (cancelled) return;
        setOverview(ov);
        setTimeline(tl.timeline);
        setTopProducts(tp.products);
        setCategories(cat.categories);
        setPeakHours(ph.matrix);
        setPaymentMethods(pm.methods);
        setCustomerInsights(ci);
      })
      .catch(err => {
        console.error('[seller/analytics] load error:', err);
        if (!cancelled) setError('Erro ao carregar analytics. Tente novamente.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [period, range.from, range.to]);

  // ---------- Insights automáticos ----------
  const insights = useMemo(() => {
    if (!overview) return [];
    const list: string[] = [];

    if (overview.delta.revenue > 15) {
      list.push(`Sua receita cresceu ${overview.delta.revenue.toFixed(1)}% em relação ao período anterior. Continue o ritmo!`);
    } else if (overview.delta.revenue < -10) {
      list.push(`Atenção: sua receita caiu ${Math.abs(overview.delta.revenue).toFixed(1)}%. Considere uma promoção ou cupom.`);
    }

    if (overview.current.cancellationRate > 15) {
      list.push(`Taxa de cancelamento em ${overview.current.cancellationRate.toFixed(1)}%. Revise seu estoque e tempo de preparo.`);
    }

    // Top produto
    if (topProducts.length > 0) {
      const top = topProducts[0];
      list.push(`Seu produto campeão é "${top.name}" com ${BRL(top.revenue)} em ${period}. Destaque ele na loja!`);
    }

    // Top categoria
    if (categories.length > 0 && categories[0].percent > 40) {
      list.push(`A categoria "${categories[0].name}" representa ${categories[0].percent.toFixed(0)}% do seu faturamento — considere ampliar o catálogo dela.`);
    }

    // Hora de pico
    if (peakHours.length > 0) {
      const peak = peakHours.reduce((a, b) => (a.count > b.count ? a : b));
      if (peak.count > 0) {
        list.push(`Seu horário de pico é ${DAYS_PT[peak.dayOfWeek]} às ${peak.hour}h. Garanta equipe e estoque nesse momento.`);
      }
    }

    // Novos clientes
    if (customerInsights) {
      const total = customerInsights.newCustomers + customerInsights.returningCustomers;
      if (total > 0) {
        const pct = (customerInsights.newCustomers / total) * 100;
        if (pct > 60) {
          list.push(`${pct.toFixed(0)}% dos seus clientes são novos. Pense em um cupom de recompra para fidelizar!`);
        } else if (pct < 20) {
          list.push(`${(100 - pct).toFixed(0)}% dos clientes são recorrentes — invista em aquisição para crescer.`);
        }
      }
    }

    return list;
  }, [overview, topProducts, categories, peakHours, customerInsights, period]);

  // ---------- Peak hours: max para normalizar ----------
  const maxPeak = useMemo(
    () => peakHours.reduce((m, c) => (c.count > m ? c.count : m), 0),
    [peakHours]
  );

  if (loading && !overview) {
    return <LoadingSkeleton variant="dashboard" />;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  return (
    <>
      <Head>
        <title>Analytics · DROP</title>
      </Head>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.title}>Analytics</h1>
            <p className={styles.subtitle}>Entenda seu desempenho e descubra como crescer</p>
          </div>
          <PeriodFilter
            value={period}
            onChange={setPeriod}
            options={['7d', '30d', '90d', 'custom']}
            range={range}
            onRangeChange={setRange}
          />
        </header>

        {customIncomplete && (
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: '16px 0' }}>
            Selecione as datas inicial e final para ver as métricas do período.
          </p>
        )}

        {/* ---- Resumo geral (todos os tempos) ---- */}
        {general && (
          <section style={{ marginBottom: 24 }}>
            <h3 className={styles.insightsTitle}>Resumo geral · todos os tempos</h3>
            <div className={styles.kpiGrid}>
              <StatCard label="Pedidos entregues" value={general.delivered} variant="green" />
              <StatCard label="Em andamento" value={general.ongoing} variant="orange" />
            </div>
          </section>
        )}

        {/* ---- KPIs ---- */}
        {overview && (
          <div className={styles.kpiGrid}>
            <StatCard
              label="Receita"
              value={BRL(overview.current.revenue)}
              delta={overview.delta.revenue}
              icon={<Icon name="dollar-sign" size={16} />}
              variant="purple"
            />
            <StatCard
              label="Pedidos"
              value={overview.current.orders}
              delta={overview.delta.orders}
              icon={<Icon name="shopping-bag" size={16} />}
              variant="blue"
            />
            <StatCard
              label="Ticket médio"
              value={BRL(overview.current.avgTicket)}
              delta={overview.delta.avgTicket}
              icon={<Icon name="target" size={16} />}
              variant="green"
            />
            <StatCard
              label="Produtos vendidos"
              value={overview.current.productsSold}
              delta={overview.delta.productsSold}
              icon={<Icon name="shopping-cart" size={16} />}
              variant="pink"
            />
            <StatCard
              label="Taxa de cancelamento"
              value={`${overview.current.cancellationRate.toFixed(1)}%`}
              delta={overview.delta.cancellationRate}
              invertDelta
              icon={<Icon name="x-circle" size={16} />}
              variant="orange"
              hint="Menor é melhor"
            />
          </div>
        )}

        {/* ---- Insights automáticos ---- */}
        {insights.length > 0 && (
          <section className={styles.insightsBox}>
            <h3 className={styles.insightsTitle}>Recomendações para você</h3>
            <ul className={styles.insightsList}>
              {insights.map((txt, i) => (
                <li key={i}>{txt}</li>
              ))}
            </ul>
          </section>
        )}

        {/* ---- Timeline ---- */}
        <ChartCard title="Vendas ao longo do tempo" subtitle={`Últimos ${period}`}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={timeline}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={11} tickFormatter={d => d.slice(5)} />
              <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} />
              <Tooltip
                contentStyle={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }}
                labelStyle={{ color: 'rgba(255,255,255,0.9)' }}
                formatter={(v: any, key: any) => (key === 'revenue' ? BRL(v) : v)}
              />
              <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
              <Line type="monotone" dataKey="revenue" name="Receita" stroke="#6C2BD9" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="orders" name="Pedidos" stroke="#38BDF8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ---- Top produtos + Top categorias ---- */}
        <div className={styles.grid2}>
          <ChartCard title="Top 10 produtos" subtitle="Mais vendidos no período">
            {topProducts.length === 0 ? (
              <div className={styles.empty}>Sem vendas no período.</div>
            ) : (
              <div className={styles.productList}>
                {topProducts.map((p, i) => (
                  <div key={p._id} className={styles.productRow}>
                    <span className={styles.productRank}>#{i + 1}</span>
                    {p.image ? (
                      <img src={p.image} alt={p.name} className={styles.productImg} />
                    ) : (
                      <div className={styles.productImgPlaceholder}>[Imagem]</div>
                    )}
                    <div className={styles.productInfo}>
                      <div className={styles.productName}>{p.name || 'Produto removido'}</div>
                      <div className={styles.productMeta}>
                        {p.quantity} vendidos · {BRL(p.revenue)}
                      </div>
                    </div>
                    <div className={styles.productBar}>
                      <div
                        className={styles.productBarFill}
                        style={{
                          width: `${(p.revenue / (topProducts[0]?.revenue || 1)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Categorias mais vendidas" subtitle="Distribuição de receita">
            {categories.length === 0 ? (
              <div className={styles.empty}>Sem dados.</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={categories}
                    dataKey="revenue"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    paddingAngle={2}
                  >
                    {categories.map((_, i) => (
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

        {/* ---- Peak hours heatmap ---- */}
        <ChartCard title="Horários de pico" subtitle="Quando você vende mais (dia × hora)">
          <div className={styles.heatmapWrap}>
            <div className={styles.heatmapHoursAxis}>
              {Array.from({ length: 24 }).map((_, h) => (
                <div key={h} className={styles.heatmapHourLabel}>
                  {h % 3 === 0 ? `${h}h` : ''}
                </div>
              ))}
            </div>
            {Array.from({ length: 7 }).map((_, i) => {
              const day = i + 1; // 1..7
              return (
                <div key={day} className={styles.heatmapRow}>
                  <div className={styles.heatmapDayLabel}>{DAYS_PT[day]}</div>
                  {Array.from({ length: 24 }).map((_, h) => {
                    const cell = peakHours.find(c => c.dayOfWeek === day && c.hour === h);
                    const intensity = cell && maxPeak > 0 ? cell.count / maxPeak : 0;
                    return (
                      <div
                        key={h}
                        className={styles.heatmapCell}
                        title={`${DAYS_PT[day]} ${h}h: ${cell?.count || 0} pedidos`}
                        style={{
                          background: `rgba(108, 43, 217, ${0.08 + intensity * 0.85})`,
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </ChartCard>

        {/* ---- Payment methods + Customers ---- */}
        <div className={styles.grid2}>
          <ChartCard title="Métodos de pagamento" subtitle="Como seus clientes pagam">
            {paymentMethods.length === 0 ? (
              <div className={styles.empty}>Sem dados.</div>
            ) : (
              <div className={styles.paymentList}>
                {paymentMethods.map((m, i) => (
                  <div key={m.method} className={styles.paymentRow}>
                    <div className={styles.paymentBadge} style={{ background: COLORS[i % COLORS.length] }} />
                    <span className={styles.paymentName}>{PAYMENT_LABELS[m.method] || m.method}</span>
                    <span className={styles.paymentPercent}>{m.percent.toFixed(1)}%</span>
                    <span className={styles.paymentCount}>{m.count} pedidos</span>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Seus melhores clientes" subtitle={`${customerInsights?.newCustomers || 0} novos · ${customerInsights?.returningCustomers || 0} recorrentes`}>
            {!customerInsights || customerInsights.topCustomers.length === 0 ? (
              <div className={styles.empty}>Sem dados.</div>
            ) : (
              <div className={styles.customerList}>
                {customerInsights.topCustomers.map((c, i) => (
                  <div key={c._id} className={styles.customerRow}>
                    <span className={styles.customerRank}>#{i + 1}</span>
                    <span className={styles.customerName}>{c.name || 'Cliente'}</span>
                    <span className={styles.customerOrders}>{c.orders} pedidos</span>
                    <span className={styles.customerRevenue}>{BRL(c.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>
        </div>
      </div>
    </>
  );
}

export default function SellerAnalyticsPage() {
  return (
    <ProtectedRoute required_role="lojista">
      <SellerAnalyticsInner />
    </ProtectedRoute>
  );
}
