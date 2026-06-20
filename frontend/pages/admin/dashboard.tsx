import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import { visibleAdminMenu } from '../../lib/adminMenu';
import styles from './AdminDashboard.module.css';

interface PlatformMetrics {
  totalBalance: number;
  totalIncome: number;
  totalUsers: number;
  totalStores: number;
  totalMotoboys: number;
  history: Array<{
    date: string;
    type: 'credit' | 'debit';
    amount: number;
    reason: string;
  }>;
}

export default function CeoDashboard() {
  const { user, can } = useAuth();
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('month');

  const activeRole = user?.activeRole || user?.role;
  // Cards de acesso rápido = itens do painel que o usuário pode ver (menos o próprio dashboard)
  const quickItems = can
    ? visibleAdminMenu(can, activeRole === 'ceo').filter((i) => i.href !== '/admin/dashboard')
    : [];

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await api.get('/wallets/platform/metrics');
        setMetrics(res.data);
      } catch (err: any) {
        console.error('Erro ao buscar métricas:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <ProtectedRoute required_permission="dashboard:view_all">
        <div className={styles.loadingScreen}>
          <LoadingSkeleton variant="dashboard" />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute required_permission="dashboard:view_all">
      <div className={styles.page}>
        <div className={styles.container}>
          {/* Header */}
          <div className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>Dashboard Executivo</h1>
              <p className={styles.pageSubtitle}>Visão geral da plataforma</p>
            </div>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className={styles.timeSelect}
            >
              <option value="week">Esta Semana</option>
              <option value="month">Este Mês</option>
              <option value="year">Este Ano</option>
              <option value="all">Tudo</option>
            </select>
          </div>

          {/* Acesso Rápido — só mostra o que este usuário pode acessar */}
          <div className={styles.quickAccessGrid}>
            {quickItems.map((item) => (
              <Link key={item.href} href={item.href} className={styles.quickCard}>
                <span className={styles.quickIcon}><Icon name={item.icon} size={20} /></span>
                <span className={styles.quickLabel}>{item.label}</span>
              </Link>
            ))}
          </div>

          {/* KPIs Principais */}
          {metrics && (
            <>
              <div className={styles.statsGrid}>
                {/* Saldo da Plataforma */}
                <div className={`${styles.kpiCard} ${styles.kpiCardBalance}`}>
                  <p className={styles.kpiLabel}>SALDO PLATAFORMA</p>
                  <h2 className={styles.kpiValue}>
                    R$ {metrics.totalBalance.toFixed(2)}
                  </h2>
                  <p className={styles.kpiNote}>Receita acumulada</p>
                </div>

                {/* Receita Total */}
                <div className={`${styles.kpiCard} ${styles.kpiCardIncome}`}>
                  <p className={styles.kpiLabel}>RECEITA TOTAL</p>
                  <h2 className={styles.kpiValue}>
                    R$ {metrics.totalIncome.toFixed(2)}
                  </h2>
                  <p className={styles.kpiNote}>Ganho acumulado</p>
                </div>

                {/* Total de Usuários */}
                <div className={`${styles.kpiCard} ${styles.kpiCardUsers}`}>
                  <p className={styles.kpiLabel}>USUÁRIOS ATIVOS</p>
                  <h2 className={styles.kpiValue}>
                    {metrics.totalUsers}
                  </h2>
                  <p className={styles.kpiNote}>Clientes da plataforma</p>
                </div>

                {/* Total de Lojas */}
                <div className={`${styles.kpiCard} ${styles.kpiCardStores}`}>
                  <p className={styles.kpiLabel}>LOJAS ATIVAS</p>
                  <h2 className={styles.kpiValue}>
                    {metrics.totalStores}
                  </h2>
                  <p className={styles.kpiNote}>Lojistas cadastrados</p>
                </div>

                {/* Motoboys */}
                <div className={`${styles.kpiCard} ${styles.kpiCardMotoboys}`}>
                  <p className={styles.kpiLabel}>MOTOBOYS ATIVO</p>
                  <h2 className={styles.kpiValue}>
                    {metrics.totalMotoboys}
                  </h2>
                  <p className={styles.kpiNote}>Entregadores ativo</p>
                </div>
              </div>

              {/* Análises */}
              <div className={styles.analyticsGrid}>
                {/* Histórico de Receitas */}
                <div className={styles.analysisCard}>
                  <h3 className={styles.analysisTitle}>Histórico de Receitas</h3>

                  <div className={styles.chartArea}>
                    {metrics.history.slice(-7).map((item, idx) => (
                      <div key={idx} className={styles.chartBarWrapper}>
                        <div
                          className={`${styles.chartBar} ${item.type === 'credit' ? styles.chartBarCredit : styles.chartBarDebit}`}
                          style={{
                            height: Math.min(200, (item.amount / Math.max(...metrics.history.map(h => h.amount))) * 200),
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = '1';
                            e.currentTarget.style.transform = 'translateY(-4px)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '0.8';
                            e.currentTarget.style.transform = 'none';
                          }}
                          title={`R$ ${item.amount.toFixed(2)}`}
                        />
                        <small className={styles.chartLabel}>
                          {new Date(item.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </small>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resumo Rápido */}
                <div className={styles.analysisCard}>
                  <h3 className={styles.analysisTitle}>Resumo Rápido</h3>

                  <div className={styles.summaryItem}>
                    <p className={styles.summaryItemLabel}>Receita por Dia</p>
                    <p className={`${styles.summaryItemValue} ${styles.summaryValuePurple}`}>
                      R$ {(metrics.totalIncome / 30).toFixed(2)}
                    </p>
                  </div>

                  <div className={styles.summaryItem}>
                    <p className={styles.summaryItemLabel}>Taxa Média Comissão</p>
                    <p className={`${styles.summaryItemValue} ${styles.summaryValueOrange}`}>
                      ~18%
                    </p>
                  </div>

                  <div className={styles.summaryItem}>
                    <p className={styles.summaryItemLabel}>Ticket Médio</p>
                    <p className={`${styles.summaryItemValue} ${styles.summaryValueGreen}`}>
                      R$ 150.00
                    </p>
                  </div>

                  <div className={styles.growthBadge}>
                    Crescimento de 12% em relação ao mês anterior
                  </div>
                </div>
              </div>

              {/* Último Histórico */}
              <div className={styles.tableCard}>
                <h3 className={styles.tableTitle}>Últimas Transações</h3>

                {metrics.history.length === 0 ? (
                  <p className={styles.emptyState}>
                    Nenhuma transação ainda
                  </p>
                ) : (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.th}>Data</th>
                        <th className={styles.th}>Tipo</th>
                        <th className={styles.th}>Valor</th>
                        <th className={styles.th}>Descrição</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.history.slice(-10).map((item, idx) => (
                        <tr key={idx} className={styles.tr}>
                          <td className={styles.td}>
                            {new Date(item.date).toLocaleDateString('pt-BR')}
                          </td>
                          <td className={styles.td}>
                            <span className={`${styles.statusBadge} ${item.type === 'credit' ? styles.badgeCredit : styles.badgeDebit}`}>
                              {item.type === 'credit' ? 'Receita' : 'Despesa'}
                            </span>
                          </td>
                          <td className={styles.td}>
                            <span className={item.type === 'credit' ? styles.amountCredit : styles.amountDebit}>
                              {item.type === 'credit' ? '+' : '-'} R$ {item.amount.toFixed(2)}
                            </span>
                          </td>
                          <td className={styles.td}>
                            {item.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
