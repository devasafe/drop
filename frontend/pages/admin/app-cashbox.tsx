import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import api from '../../lib/api';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import styles from './AdminAppCashbox.module.css';

interface AppCashboxData {
  _id: string;
  balance: number;
  totalIncome: number;
  totalExpenses: number;
  pendingObligations: number;
  platformNet: number;
  asaas?: { enabled: boolean; balance: number | null; error?: string };
  history: Array<{
    type: 'income' | 'expense' | 'withdrawal' | 'deposit';
    source: string;
    amount: number;
    orderId?: string;
    deliveryId?: string;
    reason?: string;
    date: string;
  }>;
}

interface WithdrawalRequest {
  _id: string;
  amount: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  bankInfo?: {
    account: string;
    bank: string;
    holderName: string;
  };
  requestedAt: string;
  rejectionReason?: string;
}

export default function AppCashbox() {
  const router = useRouter();
  const { user, loading: authLoading, can, permissionsLoading } = useAuth();
  const [cashbox, setCashbox] = useState<AppCashboxData | null>(null);
  const [statement, setStatement] = useState<any>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // overview | statement | withdraw
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [withdrawalForm, setWithdrawalForm] = useState({
    amount: '',
    bank: '',
    account: '',
    holderName: '',
    reason: '',
  });
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositForm, setDepositForm] = useState({
    amount: '',
    reason: '',
  });
  const [detailItem, setDetailItem] = useState<any>(null);

  // Verificar permissão
  useEffect(() => {
    if (!authLoading && !permissionsLoading && user && !can('cashbox:view')) {
      router.push('/access-denied');
    }
  }, [user, authLoading, permissionsLoading, can, router]);

  // Carregar dados
  useEffect(() => {
    if (!permissionsLoading && can('cashbox:view')) {
      loadCashboxData();
    }
  }, [user, permissionsLoading]);

  const loadCashboxData = async () => {
    try {
      setLoading(true);
      const [cashboxRes, statementRes, withdrawalsRes] = await Promise.all([
        api.get('/admin/app-cashbox'),
        api.get('/admin/app-cashbox/statement'),
        api.get('/admin/app-cashbox/withdrawals'),
      ]);

      setCashbox(cashboxRes.data);
      setStatement(statementRes.data);
      setWithdrawals(withdrawalsRes.data.withdrawals);
      setMessage(null);
    } catch (err: any) {
      console.error('Erro ao carregar caixa:', err);
      setMessage({ type: 'error', text: 'Erro ao carregar dados do caixa' });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestWithdrawal = async () => {
    if (!withdrawalForm.amount || !withdrawalForm.bank) {
      setMessage({ type: 'error', text: 'Preencha todos os campos' });
      return;
    }

    try {
      await api.post('/admin/app-cashbox/withdrawal', {
        amount: parseFloat(withdrawalForm.amount),
        reason: withdrawalForm.reason,
        bankInfo: {
          bank: withdrawalForm.bank,
          account: withdrawalForm.account,
          holderName: withdrawalForm.holderName,
        },
      });

      setMessage({ type: 'success', text: 'Solicitação de saque criada!' });
      setShowWithdrawalModal(false);
      setWithdrawalForm({ amount: '', bank: '', account: '', holderName: '', reason: '' });
      loadCashboxData();
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || 'Erro ao solicitar saque';
      setMessage({ type: 'error', text: errorMsg });
    }
  };

  const handleRegisterDeposit = async () => {
    if (!depositForm.amount) {
      setMessage({ type: 'error', text: 'Informe o valor do depósito' });
      return;
    }

    try {
      await api.post('/admin/app-cashbox/deposit', {
        amount: parseFloat(depositForm.amount),
        reason: depositForm.reason,
      });

      setMessage({ type: 'success', text: 'Depósito registrado!' });
      setShowDepositModal(false);
      setDepositForm({ amount: '', reason: '' });
      loadCashboxData();
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || 'Erro ao registrar depósito';
      setMessage({ type: 'error', text: errorMsg });
    }
  };

  const handleApproveWithdrawal = async (id: string) => {
    try {
      await api.put(`/admin/app-cashbox/withdrawals/${id}/approve`);
      setMessage({ type: 'success', text: 'Saque aprovado!' });
      loadCashboxData();
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || 'Erro ao aprovar saque';
      setMessage({ type: 'error', text: errorMsg });
    }
  };

  const handleRejectWithdrawal = async (id: string) => {
    const reason = prompt('Motivo da rejeição:');
    if (!reason) return;

    try {
      await api.put(`/admin/app-cashbox/withdrawals/${id}/reject`, {
        rejectionReason: reason,
      });
      setMessage({ type: 'success', text: 'Saque rejeitado!' });
      loadCashboxData();
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || 'Erro ao rejeitar saque';
      setMessage({ type: 'error', text: errorMsg });
    }
  };

  if (authLoading || loading) {
    return (
      <ProtectedRoute required_permission="cashbox:view">
        <div className={styles.loadingWrapper}>
          <LoadingSkeleton variant="dashboard" />
        </div>
      </ProtectedRoute>
    );
  }

  const getSourceLabel = (source: string) => {
    const labels: { [key: string]: string } = {
      product_commission: 'Comissão de Produto',
      delivery_commission: 'Comissão de Entrega',
      order_payment: 'Pagamento de Pedido',
      order_refund: 'Reembolso de Pedido',
      payout_paid: 'Repasse Pago',
      manual_deposit: 'Depósito Manual',
      manual_withdrawal: 'Saque',
      withdrawal_fee: 'Taxa de Saque',
    };
    return labels[source] || source;
  };

  return (
    <ProtectedRoute required_permission="cashbox:view">
      <div className={styles.page}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.headerTitle}><Icon name="bank" size={20} /> Caixa do App</h1>
            <p className={styles.headerSubtitle}>Gerenciar saldo, saques e depósitos da plataforma</p>
          </div>
          <div className={styles.headerActions}>
            <button
              onClick={() => setShowDepositModal(true)}
              className={styles.btnDeposit}
            >
              <Icon name="plus" size={14} /> Registrar Depósito
            </button>
            <button
              onClick={() => setShowWithdrawalModal(true)}
              className={styles.btnWithdraw}
            >
              <Icon name="send" size={14} /> Solicitar Saque
            </button>
          </div>
        </div>

        {message && (
          <div className={message.type === 'success' ? styles.alertSuccess : styles.alertError}>
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className={styles.tabs}>
          {['overview', 'statement', 'withdraw'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            >
              {tab === 'overview' && <><Icon name="chart-bar" size={14} /> Resumo</>}
              {tab === 'statement' && <><Icon name="clipboard" size={14} /> Extrato</>}
              {tab === 'withdraw' && <><Icon name="send" size={14} /> Saques</>}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && cashbox && (
          <div>
            {/* Modo Asaas: o dinheiro real fica na conta-mãe do gateway, não no caixa legado */}
            {cashbox.asaas?.enabled && (
              <div
                className={styles.statCard}
                style={{ marginBottom: 16, borderColor: 'var(--drop-purple, #6C2BD9)' }}
              >
                <div className={styles.statLabel}>
                  <Icon name="bank" size={14} /> Saldo real — conta-mãe Asaas (custódia)
                </div>
                <div className={styles.statValueGreen}>
                  {cashbox.asaas.balance != null
                    ? `R$ ${cashbox.asaas.balance.toFixed(2)}`
                    : '— indisponível'}
                </div>
                <div className={styles.historyDate} style={{ marginTop: 6 }}>
                  {cashbox.asaas.error
                    ? `Não foi possível consultar o Asaas: ${cashbox.asaas.error}`
                    : 'Neste modo, a custódia e os repasses ficam no Asaas. Os números abaixo (caixa legado) são apenas contábeis.'}
                </div>
              </div>
            )}

            <div className={styles.statsGrid}>
              {/* Custodia Total */}
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Custodia Total</div>
                <div className={styles.statValueGreen}>
                  R$ {cashbox.balance.toFixed(2)}
                </div>
              </div>

              {/* Lucro Liquido */}
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Lucro Liquido da Plataforma</div>
                <div className={styles.statValueBlue}>
                  R$ {(cashbox.platformNet ?? cashbox.balance).toFixed(2)}
                </div>
              </div>

              {/* Obrigacoes Pendentes */}
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Obrigacoes Pendentes</div>
                <div className={styles.statValueRed} style={{ color: '#f59e0b' }}>
                  R$ {(cashbox.pendingObligations ?? 0).toFixed(2)}
                </div>
              </div>

              {/* Renda Total */}
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Renda Total</div>
                <div className={styles.statValueBlue}>
                  R$ {cashbox.totalIncome.toFixed(2)}
                </div>
              </div>

              {/* Saidas Totais */}
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Saidas Totais</div>
                <div className={styles.statValueRed}>
                  R$ {cashbox.totalExpenses.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Últimas transações */}
            <div className={styles.historyCard}>
              <h3 className={styles.historyTitle}><Icon name="list" size={16} /> Últimas Movimentações</h3>
              <div className={styles.historyScroll}>
                {cashbox.history.slice(0, 10).map((item, idx) => (
                  <div
                    key={idx}
                    className={`${styles.historyRow} ${idx >= 9 ? styles.historyRowLast : ''}`}
                  >
                    <div>
                      <div className={styles.historySource}>
                        {getSourceLabel(item.source)}
                      </div>
                      <div className={styles.historyDate}>
                        {new Date(item.date).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div className={item.type === 'income' ? styles.amountIncome : styles.amountExpense}>
                      {item.type === 'income' ? '+' : '-'} R$ {item.amount.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Statement Tab */}
        {activeTab === 'statement' && statement && (
          <>
            {/* Tabela (desktop) */}
            <div className={`${styles.tableCard} ${styles.statementDesktop}`}>
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead className={styles.tableHead}>
                    <tr>
                      <th>Tipo</th>
                      <th>Origem</th>
                      <th>Data</th>
                      <th className={styles.thRight}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.statement?.map((item: any, idx: number) => (
                      <tr
                        key={idx}
                        className={styles.tableRow}
                        onClick={() => setDetailItem(item)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <span className={item.type === 'income' ? styles.badgeIncome : styles.badgeExpense}>
                            {item.type === 'income' ? 'Entrada' : 'Saída'}
                          </span>
                        </td>
                        <td>{getSourceLabel(item.source)}</td>
                        <td>
                          {new Date(item.date).toLocaleString('pt-BR')}
                        </td>
                        <td className={`${styles.tdRight} ${item.type === 'income' ? styles.tdAmountIncome : styles.tdAmountExpense}`}>
                          {item.type === 'income' ? '+' : '-'} R$ {item.amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Lista de cards (mobile) */}
            <div className={styles.statementMobile}>
              {statement.statement?.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className={styles.statementCard}
                  onClick={() => setDetailItem(item)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={styles.statementCardHeader}>
                    <span className={item.type === 'income' ? styles.badgeIncome : styles.badgeExpense}>
                      {item.type === 'income' ? 'Entrada' : 'Saída'}
                    </span>
                    <span className={item.type === 'income' ? styles.tdAmountIncome : styles.tdAmountExpense}>
                      {item.type === 'income' ? '+' : '-'} R$ {item.amount.toFixed(2)}
                    </span>
                  </div>
                  <div className={styles.statementCardSource}>{getSourceLabel(item.source)}</div>
                  <div className={styles.statementCardDate}>
                    {new Date(item.date).toLocaleString('pt-BR')}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Withdrawals Tab */}
        {activeTab === 'withdraw' && (
          <div>
            {withdrawals.length > 0 ? (
              <div className={styles.withdrawalsGrid}>
                {withdrawals.map((w) => (
                  <div key={w._id} className={styles.withdrawalCard}>
                    <div className={styles.withdrawalHeader}>
                      <div>
                        <div className={styles.withdrawalAmount}>
                          R$ {w.amount.toFixed(2)}
                        </div>
                        <div className={styles.withdrawalDate}>
                          {new Date(w.requestedAt).toLocaleString('pt-BR')}
                        </div>
                      </div>
                      <span className={
                        w.status === 'pending' ? styles.badgePending :
                        w.status === 'approved' ? styles.badgeApproved :
                        w.status === 'paid' ? styles.badgePaid :
                        styles.badgeRejected
                      }>
                        {w.status === 'pending' ? 'Pendente' : w.status === 'approved' ? 'Aprovado' : w.status === 'paid' ? 'Pago' : 'Rejeitado'}
                      </span>
                    </div>

                    {w.bankInfo && (
                      <div className={styles.bankInfoBox}>
                        <div><Icon name="bank" size={13} /> {w.bankInfo.bank}</div>
                        <div><Icon name="user" size={13} /> {w.bankInfo.holderName}</div>
                        <div><Icon name="credit-card" size={13} /> {w.bankInfo.account}</div>
                      </div>
                    )}

                    {w.rejectionReason && (
                      <div className={styles.rejectionBox}>
                        <Icon name="x-circle" size={13} /> {w.rejectionReason}
                      </div>
                    )}

                    {w.status === 'pending' && (
                      <div className={styles.withdrawalActions}>
                        <button
                          onClick={() => handleApproveWithdrawal(w._id)}
                          className={styles.btnApprove}
                        >
                          <Icon name="check" size={14} /> Aprovar
                        </button>
                        <button
                          onClick={() => handleRejectWithdrawal(w._id)}
                          className={styles.btnReject}
                        >
                          <Icon name="x" size={14} /> Rejeitar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.withdrawalsEmpty}>
                Nenhuma solicitação de saque
              </div>
            )}
          </div>
        )}

        {/* Withdrawal Modal */}
        {showWithdrawalModal && (
          <div className={styles.modalOverlay}>
            <div className={`${styles.modalBox} ${styles.modalBoxMd}`}>
              <h2 className={styles.modalTitle}><Icon name="send" size={18} /> Solicitar Saque</h2>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Valor (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={withdrawalForm.amount}
                  onChange={(e) => setWithdrawalForm({ ...withdrawalForm, amount: e.target.value })}
                  className={styles.input}
                  placeholder="0.00"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Banco
                </label>
                <input
                  type="text"
                  value={withdrawalForm.bank}
                  onChange={(e) => setWithdrawalForm({ ...withdrawalForm, bank: e.target.value })}
                  className={styles.input}
                  placeholder="ex: Banco do Brasil"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Agência / Conta
                </label>
                <input
                  type="text"
                  value={withdrawalForm.account}
                  onChange={(e) => setWithdrawalForm({ ...withdrawalForm, account: e.target.value })}
                  className={styles.input}
                  placeholder="ex: 1234-5 / 123456789-0"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Titular da Conta
                </label>
                <input
                  type="text"
                  value={withdrawalForm.holderName}
                  onChange={(e) => setWithdrawalForm({ ...withdrawalForm, holderName: e.target.value })}
                  className={styles.input}
                  placeholder="Nome"
                />
              </div>

              <div className={styles.formGroupLast}>
                <label className={styles.label}>
                  Motivo (opcional)
                </label>
                <textarea
                  value={withdrawalForm.reason}
                  onChange={(e) => setWithdrawalForm({ ...withdrawalForm, reason: e.target.value })}
                  className={styles.textarea}
                  placeholder="Motivo do saque..."
                />
              </div>

              <div className={styles.modalActions}>
                <button
                  onClick={() => setShowWithdrawalModal(false)}
                  className={styles.btnCancel}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRequestWithdrawal}
                  className={styles.btnSubmitBlue}
                >
                  Solicitar Saque
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Deposit Modal */}
        {showDepositModal && (
          <div className={styles.modalOverlay}>
            <div className={`${styles.modalBox} ${styles.modalBoxSm}`}>
              <h2 className={styles.modalTitle}><Icon name="wallet" size={18} /> Registrar Depósito</h2>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Valor (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={depositForm.amount}
                  onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })}
                  className={styles.input}
                  placeholder="0.00"
                />
              </div>

              <div className={styles.formGroupLast}>
                <label className={styles.label}>
                  Motivo / Descrição
                </label>
                <textarea
                  value={depositForm.reason}
                  onChange={(e) => setDepositForm({ ...depositForm, reason: e.target.value })}
                  className={styles.textarea}
                  placeholder="Descrição do depósito..."
                />
              </div>

              <div className={styles.modalActions}>
                <button
                  onClick={() => setShowDepositModal(false)}
                  className={styles.btnCancel}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRegisterDeposit}
                  className={styles.btnSubmitGreen}
                >
                  Registrar Depósito
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Detalhes da transação */}
        {detailItem && (
          <div
            onClick={() => setDetailItem(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 1000, padding: 16
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--drop-surface)', border: '1px solid var(--drop-border)',
                borderRadius: 'var(--drop-radius-lg)', padding: 24, maxWidth: 480, width: '100%',
                color: 'var(--drop-white)', fontFamily: 'var(--drop-font-body)',
                maxHeight: '85vh', overflowY: 'auto'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <span className={detailItem.type === 'income' ? styles.badgeIncome : styles.badgeExpense}>
                    {detailItem.type === 'income' ? 'Entrada' : 'Saída'}
                  </span>
                  <h3 style={{ margin: '10px 0 0 0', fontSize: 18, fontFamily: 'var(--drop-font-display)' }}>
                    {getSourceLabel(detailItem.source)}
                  </h3>
                </div>
                <button
                  onClick={() => setDetailItem(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--drop-text-muted)', cursor: 'pointer', fontSize: 22, lineHeight: 1 }}
                  aria-label="Fechar"
                >✕</button>
              </div>

              <div style={{
                padding: '16px 0', borderTop: '1px solid var(--drop-border)',
                borderBottom: '1px solid var(--drop-border)', marginBottom: 16
              }}>
                <div style={{ fontSize: 12, color: 'var(--drop-text-muted)', marginBottom: 4 }}>Valor</div>
                <div
                  className={detailItem.type === 'income' ? styles.tdAmountIncome : styles.tdAmountExpense}
                  style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--drop-font-display)' }}
                >
                  {detailItem.type === 'income' ? '+' : '-'} R$ {Number(detailItem.amount || 0).toFixed(2)}
                </div>
              </div>

              <dl style={{ margin: 0, display: 'grid', gap: 12 }}>
                <div>
                  <dt style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--drop-text-muted)', letterSpacing: '0.06em', marginBottom: 2 }}>Tipo</dt>
                  <dd style={{ margin: 0, fontSize: 14 }}>{detailItem.type}</dd>
                </div>
                <div>
                  <dt style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--drop-text-muted)', letterSpacing: '0.06em', marginBottom: 2 }}>Origem</dt>
                  <dd style={{ margin: 0, fontSize: 14 }}>{detailItem.source}</dd>
                </div>
                <div>
                  <dt style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--drop-text-muted)', letterSpacing: '0.06em', marginBottom: 2 }}>Data e hora</dt>
                  <dd style={{ margin: 0, fontSize: 14 }}>
                    {new Date(detailItem.date).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit', second: '2-digit'
                    })}
                  </dd>
                </div>
                {detailItem.reason && (
                  <div>
                    <dt style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--drop-text-muted)', letterSpacing: '0.06em', marginBottom: 2 }}>Motivo / descrição</dt>
                    <dd style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{detailItem.reason}</dd>
                  </div>
                )}
                {detailItem.orderId && (
                  <div>
                    <dt style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--drop-text-muted)', letterSpacing: '0.06em', marginBottom: 2 }}>Pedido</dt>
                    <dd style={{ margin: 0, fontSize: 13 }}>
                      <a
                        href={`/admin/order/${detailItem.orderId}`}
                        style={{ color: 'var(--drop-purple-2)', fontFamily: 'monospace', textDecoration: 'underline' }}
                      >
                        #{String(detailItem.orderId).slice(-8)}
                      </a>
                    </dd>
                  </div>
                )}
                {detailItem.deliveryId && (
                  <div>
                    <dt style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--drop-text-muted)', letterSpacing: '0.06em', marginBottom: 2 }}>Entrega</dt>
                    <dd style={{ margin: 0, fontSize: 13, fontFamily: 'monospace' }}>
                      #{String(detailItem.deliveryId).slice(-8)}
                    </dd>
                  </div>
                )}
                {detailItem.withdrawalId && (
                  <div>
                    <dt style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--drop-text-muted)', letterSpacing: '0.06em', marginBottom: 2 }}>Saque</dt>
                    <dd style={{ margin: 0, fontSize: 13, fontFamily: 'monospace' }}>
                      #{String(detailItem.withdrawalId).slice(-8)}
                    </dd>
                  </div>
                )}
                {detailItem._id && (
                  <div>
                    <dt style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--drop-text-muted)', letterSpacing: '0.06em', marginBottom: 2 }}>ID da transação</dt>
                    <dd style={{ margin: 0, fontSize: 11, fontFamily: 'monospace', color: 'var(--drop-text-muted)', wordBreak: 'break-all' }}>
                      {String(detailItem._id)}
                    </dd>
                  </div>
                )}
              </dl>

              <button
                onClick={() => setDetailItem(null)}
                style={{
                  marginTop: 20, width: '100%', padding: '11px 16px',
                  background: 'var(--drop-purple)', border: 'none',
                  borderRadius: 'var(--drop-radius-sm)', color: 'var(--drop-white)',
                  cursor: 'pointer', fontSize: 14, fontWeight: 600
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
