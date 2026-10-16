/**
 * Números do negócio (D3a, spec 5.5; protótipo tela 7). Funde o dashboard antigo (caixa da plataforma,
 * GET /wallets/platform/metrics) e o analytics antigo (GET /analytics/platform/*), com os mesmos endpoints
 * e períodos (7, 30 e 90 dias; padrão 30; top lojas com limite 15).
 * Permissão (decisão D1): a página abre com dashboard:view_all OU analytics:view_platform; cada bloco de número
 * aparece só com analytics:view_platform, a permissão que o servidor exige em todas essas leituras. Sem ela,
 * a tela mostra os atalhos do papel (o "Acesso rápido" de antes), tirados do menu (já filtrado por modo).
 * Cada bloco carrega sozinho; erro = aviso com "Tentar de novo", nunca zero.
 */
import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { Kpi } from '../../components/admin/Kpi';
import { AdminTable, type AdminColumn } from '../../components/admin/AdminTable';
import blocks from '../../components/admin/AdminBlocks.module.css';
import { BlockState } from '../../components/admin/numeros/BlockState';
import { useBlockData } from '../../components/admin/numeros/useBlockData';
import { OrdersCharts, UserGrowthChart } from '../../components/admin/numeros/TimelineCharts';
import styles from '../../components/admin/numeros/Numeros.module.css';
import PushEnableBanner from '../../components/PushEnableBanner';
import Icon from '../../components/Icon';
import { Alert } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Chip';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminNav } from '../../hooks/useAdminNav';
import api from '../../lib/api';
import { platformAnalytics, type Period, type TopStore } from '../../lib/analyticsApi';
import {
  NUMEROS_PERIODS, avgTicket, brl, cohortLevel, cohortMonth, commissionShare, deltaHint, num, pct, platformInsights,
  type CohortLevel, type PlatformMetrics,
} from '../../lib/adminNumeros';

const LiveUsersMap = dynamic(() => import('../../components/analytics/LiveUsersMap'), { ssr: false });

const NUMBERS_PERMISSION = 'analytics:view_platform';
const OFFSETS = [0, 1, 2, 3];
const HEAT: Record<CohortLevel, string> = {
  none: styles.heatNone, low: styles.heatLow, mid: styles.heatMid, high: styles.heatHigh,
};

type HistoryRow = PlatformMetrics['history'][number] & { idx: number };
type StoreRow = TopStore & { rank: number };

const typeLabel = (t: 'credit' | 'debit') => (t === 'credit' ? 'Entrada' : 'Saída');

const HISTORY_COLUMNS: AdminColumn<HistoryRow>[] = [
  { key: 'reason', header: 'Descrição', primary: true, render: (r) => r.reason || typeLabel(r.type) },
  { key: 'date', header: 'Data', render: (r) => new Date(r.date).toLocaleDateString('pt-BR') },
  { key: 'type', header: 'Tipo', render: (r) => typeLabel(r.type) },
  { key: 'amount', header: 'Valor', align: 'right', render: (r) => `${r.type === 'credit' ? '+' : '−'} ${brl(r.amount)}` },
];

const STORE_COLUMNS: AdminColumn<StoreRow>[] = [
  // O nome da loja fica num elemento próprio (a posição vai em outro), para o texto ser encontrado inteiro.
  { key: 'name', header: 'Loja', primary: true, render: (s) => <><span>{s.rank}º</span> <span>{s.name || 'Loja'}</span></> },
  { key: 'city', header: 'Cidade', render: (s) => s.city || '—' },
  { key: 'orders', header: 'Pedidos', align: 'right', render: (s) => num(s.orders) },
  { key: 'ticket', header: 'Ticket médio', align: 'right', render: (s) => brl(s.avgTicket) },
  { key: 'revenue', header: 'Vendido', align: 'right', render: (s) => brl(s.revenue) },
];

function Block({ id, title, meta, children }: { id: string; title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className={blocks.block} aria-labelledby={id}>
      <div className={blocks.blockHead}>
        <h2 id={id} className={blocks.blockTitle}>{title}</h2>
        {meta && <span className={blocks.muted}>{meta}</span>}
      </div>
      {children}
    </section>
  );
}

/** Sem a permissão de números: as páginas do admin que o papel abre (o "Acesso rápido" de antes). */
function Atalhos() {
  const { areas } = useAdminNav();
  const links = areas
    .filter((a) => a.key !== 'numeros')
    .flatMap((a) => a.tabs.map((t) => ({
      key: `${a.key}-${t.key}`,
      href: t.href,
      icon: a.icon,
      label: a.label === t.label ? a.label : `${a.label} · ${t.label}`,
    })));
  return (
    <Block id="numeros-atalhos" title="Atalhos">
      <p className={blocks.muted}>Os números do negócio aparecem para quem tem a permissão de ver os números da plataforma.</p>
      {links.length === 0 ? (
        <p className={blocks.muted}>Nenhuma outra área liberada para o seu papel.</p>
      ) : (
        <ul className={styles.shortcuts}>
          {links.map((l) => (
            <li key={l.key}>
              <Link href={l.href} className={styles.shortcut}>
                <Icon name={l.icon} size={18} />
                <span>{l.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

function NumerosDoNegocio() {
  const { can } = useAuth();
  const seesNumbers = typeof can === 'function' && can(NUMBERS_PERMISSION);
  const [period, setPeriod] = useState<Period>('30d');
  const key = seesNumbers ? period : null;

  const caixa = useBlockData<PlatformMetrics>(seesNumbers ? 'caixa' : null,
    () => api.get('/wallets/platform/metrics').then((r) => r.data));
  const overview = useBlockData(key, () => platformAnalytics.overview(period));
  const growth = useBlockData(key, () => platformAnalytics.userGrowth(period));
  const timeline = useBlockData(key, () => platformAnalytics.ordersTimeline(period));
  const funnel = useBlockData(key, () => platformAnalytics.funnel(period));
  const stores = useBlockData(key, () => platformAnalytics.topStores(period, 15));
  const categories = useBlockData(key, () => platformAnalytics.topCategories(period));
  const retention = useBlockData(key, () => platformAnalytics.retention(period));

  const periodLabel = NUMEROS_PERIODS.find((p) => p.value === period)?.label ?? '';
  const insights = overview.data ? platformInsights(overview.data, funnel.data, stores.data?.stores ?? []) : [];
  const storeRows: StoreRow[] | null = stores.data ? stores.data.stores.map((s, i) => ({ ...s, rank: i + 1 })) : null;

  const actions = seesNumbers ? (
    <div className={styles.periods} role="group" aria-label="Período">
      {NUMEROS_PERIODS.map((p) => (
        <Chip key={p.value} label={p.label} active={period === p.value} onClick={() => setPeriod(p.value)} />
      ))}
    </div>
  ) : undefined;

  return (
    <AdminShell title="Números do negócio" tabs="numeros" actions={actions}>
      <div className={styles.page}>
        <PushEnableBanner
          title="Receba avisos de ações pendentes"
          description="Ative para ser avisado de verificações, saques e suporte mesmo com o painel fechado."
        />

        {!seesNumbers ? <Atalhos /> : (
          <>
            <Block id="numeros-resumo" title="Resumo do período" meta={periodLabel}>
              <BlockState state={overview} rows={2}>
                {(o) => {
                  const c = o.current;
                  const d = o.delta;
                  const days = o.period.days;
                  const ticket = avgTicket(c.gmv, c.orders);
                  const share = commissionShare(c.commission, c.gmv);
                  return (
                    <div className={blocks.kpis}>
                      <Kpi label="Vendido" value={brl(c.gmv)} hint={deltaHint(d.gmv, days)} />
                      <Kpi label="Pedidos" value={num(c.orders)}
                        hint={[ticket !== null ? `ticket médio ${brl(ticket)}` : null, deltaHint(d.orders, days)].filter(Boolean).join(' · ')} />
                      <Kpi label="Receita do DROP" value={brl(c.commission)}
                        hint={[share !== null ? `${pct(share)} do vendido` : null, deltaHint(d.commission, days)].filter(Boolean).join(' · ')} />
                      <Kpi label="Cadastros novos" value={num(c.newUsers)} hint={deltaHint(d.newUsers, days)} />
                      <Kpi label="Compraram no período" value={num(c.activeUsers)} hint={deltaHint(d.activeUsers, days)} />
                    </div>
                  );
                }}
              </BlockState>
            </Block>

            {insights.length > 0 && (
              <Alert tone="info" title="O que chama atenção">
                <ul className={styles.insights}>
                  {insights.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </Alert>
            )}

            <div className={blocks.grid2}>
              <Block id="numeros-funil" title="Funil de clientes" meta={periodLabel}>
                <BlockState state={funnel}>
                  {(f) => {
                    const first = f.steps[0]?.count ?? 0;
                    return (
                      <>
                        <ol className={styles.list}>
                          {f.steps.map((s, i) => {
                            const share = i === 0 ? 100 : first > 0 ? (s.count / first) * 100 : 0;
                            return (
                              <li key={s.label} className={styles.listRow}>
                                <span>{s.label}</span>
                                <span className={styles.count}>{`${num(s.count)} (${pct(share)})`}</span>
                                <ProgressBar value={share} label={`${s.label}: ${pct(share)}`} />
                              </li>
                            );
                          })}
                        </ol>
                        <div className={styles.rates}>
                          <div className={styles.rate}>
                            <span className={styles.rateLabel}>Cadastro → 1º pedido</span>
                            <strong className={styles.rateValue}>{pct(f.conversionRates.registerToFirstOrder)}</strong>
                          </div>
                          <div className={styles.rate}>
                            <span className={styles.rateLabel}>1º → 2º pedido</span>
                            <strong className={styles.rateValue}>{pct(f.conversionRates.firstOrderToSecond)}</strong>
                          </div>
                        </div>
                      </>
                    );
                  }}
                </BlockState>
              </Block>

              <Block id="numeros-retencao" title="Voltam a comprar" meta="por mês do 1º pedido">
                <BlockState state={retention}>
                  {(r) => (r.cohorts.length === 0 ? (
                    <p className={blocks.muted}>Ainda não há meses suficientes para comparar.</p>
                  ) : (
                    <div className={styles.tableWrap}>
                      <table className={styles.cohort}>
                        <thead>
                          <tr>
                            <th scope="col">Mês</th>
                            <th scope="col">Pessoas</th>
                            {OFFSETS.map((o) => (
                              <th key={o} scope="col">{o === 0 ? '1º mês' : `+${o} ${o === 1 ? 'mês' : 'meses'}`}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {r.cohorts.map((c) => (
                            <tr key={c.cohort}>
                              <th scope="row">{cohortMonth(c.cohort)}</th>
                              <td>{num(c.size)}</td>
                              {OFFSETS.map((o) => {
                                const v = c.retention[o];
                                return <td key={o} className={HEAT[cohortLevel(v)]}>{v === undefined ? '—' : pct(v)}</td>;
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </BlockState>
              </Block>
            </div>

            <div className={blocks.grid2}>
              <Block id="numeros-crescimento" title="Crescimento de usuários" meta="cadastros novos por dia">
                <BlockState state={growth}>
                  {(g) => (g.timeline.length === 0
                    ? <p className={blocks.muted}>Sem cadastros no período.</p>
                    : <UserGrowthChart points={g.timeline} />)}
                </BlockState>
              </Block>
              <Block id="numeros-pedidos" title="Pedidos e vendido" meta={periodLabel}>
                <BlockState state={timeline}>
                  {(t) => (t.timeline.length === 0
                    ? <p className={blocks.muted}>Sem pedidos no período.</p>
                    : <OrdersCharts points={t.timeline} />)}
                </BlockState>
              </Block>
            </div>

            <div className={blocks.grid2}>
              <Block id="numeros-lojas" title="Lojas que mais vendem" meta={periodLabel}>
                <AdminTable<StoreRow>
                  columns={STORE_COLUMNS}
                  rows={storeRows}
                  rowKey={(s) => s._id}
                  loading={stores.loading}
                  error={stores.error}
                  onRetry={stores.retry}
                  empty="Nenhuma venda no período."
                  caption="Lojas que mais vendem"
                />
              </Block>
              <Block id="numeros-categorias" title="Categorias mais vendidas" meta={periodLabel}>
                <BlockState state={categories}>
                  {(c) => (c.categories.length === 0 ? (
                    <p className={blocks.muted}>Nenhuma venda no período.</p>
                  ) : (
                    <ul className={styles.list}>
                      {c.categories.map((cat) => (
                        <li key={cat._id} className={styles.listRow}>
                          <span>{cat.name}</span>
                          <span className={styles.count}>{`${brl(cat.revenue)} · ${pct(cat.percent)}`}</span>
                          <ProgressBar value={cat.percent} label={`${cat.name}: ${pct(cat.percent)} do vendido`} />
                        </li>
                      ))}
                    </ul>
                  ))}
                </BlockState>
              </Block>
            </div>

            <Block id="numeros-base" title="Base da plataforma">
              <BlockState state={overview} rows={3}>
                {(o) => (
                  <dl className={styles.sum}>
                    <div className={styles.sumRow}><dt>Usuários cadastrados</dt><dd>{num(o.current.totalUsers)}</dd></div>
                    <div className={styles.sumRow}><dt>Lojas cadastradas</dt><dd>{num(o.current.totalStores)}</dd></div>
                    <div className={styles.sumRow}><dt>Lojas novas no período</dt><dd>{num(o.current.newStores)}</dd></div>
                  </dl>
                )}
              </BlockState>
            </Block>

            <Block id="numeros-caixa" title="Caixa da plataforma" meta="carteira do DROP">
              <BlockState state={caixa} rows={4}>
                {(m) => (
                  <>
                    <div className={blocks.kpis}>
                      <Kpi label="Saldo" value={brl(m.totalBalance)} />
                      <Kpi label="Entradas acumuladas" value={brl(m.totalIncome)} />
                      <Kpi label="Saídas acumuladas" value={brl(m.totalSpent)} />
                    </div>
                    <AdminTable<HistoryRow>
                      columns={HISTORY_COLUMNS}
                      rows={m.history.slice(0, 10).map((h, idx) => ({ ...h, idx }))}
                      rowKey={(r) => `${r.date}-${r.idx}`}
                      empty="Nenhuma movimentação ainda."
                      caption="Últimas movimentações"
                    />
                  </>
                )}
              </BlockState>
            </Block>

            <Block id="numeros-mapa" title="Usuários ao vivo" meta="quem está usando o app agora">
              <div className={styles.map}>
                <LiveUsersMap />
              </div>
            </Block>
          </>
        )}
      </div>
    </AdminShell>
  );
}

export default function NumerosDoNegocioPage() {
  return (
    <ProtectedRoute required_permission={['dashboard:view_all', 'analytics:view_platform']}>
      <NumerosDoNegocio />
    </ProtectedRoute>
  );
}
