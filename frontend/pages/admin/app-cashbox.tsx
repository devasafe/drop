/**
 * Dinheiro · Caixa da plataforma (DS v2, D3a, tela 18). Só custódia: o servidor exige requireSettlement('custodia').
 * Chamadas iguais às da página antiga (__tests__/admin.dinheiro.caixa.test.tsx):
 * GET /admin/app-cashbox · /admin/app-cashbox/statement · /admin/app-cashbox/withdrawals ·
 * POST /admin/app-cashbox/withdrawal { amount, reason, bankInfo: { bank, account, holderName } } ·
 * POST /admin/app-cashbox/deposit { amount, reason } · PUT /admin/app-cashbox/withdrawals/:id/approve ·
 * PUT /admin/app-cashbox/withdrawals/:id/reject { rejectionReason }.
 * Cada botão usa o can() da rota: cashbox:withdraw, cashbox:deposit, cashbox:approve_withdrawal.
 * Valor digitado (retirada, depósito): exatamente o digitado (lib/adminAmount, a mesma regra de Carteiras),
 * com prévia antes de confirmar; o corpo continua { amount: number, ... }.
 */
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { AdminTable, type AdminColumn } from '../../components/admin/AdminTable';
import { AdminSheet } from '../../components/admin/AdminSheet';
import { Kpi } from '../../components/admin/Kpi';
import blocks from '../../components/admin/AdminBlocks.module.css';
import { LoadError, LoadSkeleton } from '../../components/admin/LoadState';
import { StatusTag, type StatusTone } from '../../components/admin/StatusTag';
import ui from '../../components/admin/dinheiro/Dinheiro.module.css';
import { TextAreaField } from '../../components/admin/dinheiro/TextAreaField';
import { flattenServerError } from '../../components/admin/dinheiro/serverError';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import { amountFieldError, parseAmount } from '../../lib/adminAmount';
import { formatMoney } from '../../lib/money';

interface CashboxData {
  _id: string;
  balance: number;
  totalIncome: number;
  totalExpenses: number;
  pendingObligations?: number;
  platformNet?: number;
  asaas?: { enabled: boolean; balance: number | null; error?: string };
}

interface StatementItem {
  _id?: string;
  type: 'income' | 'expense' | 'withdrawal' | 'deposit';
  source: string;
  amount: number;
  orderId?: string;
  deliveryId?: string;
  withdrawalId?: string;
  reason?: string;
  date: string;
}

interface CashWithdrawal {
  _id: string;
  amount: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  bankInfo?: { account: string; bank: string; holderName: string };
  requestedAt: string;
  rejectionReason?: string;
}

interface Loaded {
  cashbox: CashboxData;
  statement: StatementItem[];
  withdrawals: CashWithdrawal[];
}

const SOURCE_LABEL: Record<string, string> = {
  product_commission: 'Comissão de produto',
  delivery_commission: 'Comissão de entrega',
  order_payment: 'Pagamento de pedido',
  order_refund: 'Reembolso de pedido',
  payout_paid: 'Repasse pago',
  manual_deposit: 'Depósito manual',
  manual_withdrawal: 'Retirada',
  withdrawal_fee: 'Taxa de retirada',
};
const WITHDRAWAL_STATUS: Record<CashWithdrawal['status'], { label: string; tone: StatusTone }> = {
  pending: { label: 'Aguardando aprovação', tone: 'warn' },
  approved: { label: 'Aprovada', tone: 'info' },
  paid: { label: 'Paga', tone: 'ok' },
  rejected: { label: 'Recusada', tone: 'bad' },
};
const EMPTY_WITHDRAW = { amount: '', bank: '', account: '', holderName: '', reason: '' };

const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s;
const isIncome = (s: StatementItem) => s.type === 'income';
const money = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? formatMoney(v) : '—');
const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const statementKey = (s: StatementItem) => s._id ?? `${s.date}|${s.source}|${s.amount}`;
const bankTitle = (w: CashWithdrawal) =>
  (w.bankInfo ? `${w.bankInfo.bank} · ${w.bankInfo.holderName}` : 'Sem dados bancários');

export default function AdminCashboxPage() {
  const router = useRouter();
  const { user, loading: authLoading, can, permissionsLoading } = useAuth();
  const { showToast } = useToast();

  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState(EMPTY_WITHDRAW);
  const [depositOpen, setDepositOpen] = useState(false);
  const [deposit, setDeposit] = useState({ amount: '', reason: '' });
  const [approving, setApproving] = useState<CashWithdrawal | null>(null);
  const [rejecting, setRejecting] = useState<CashWithdrawal | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [detail, setDetail] = useState<StatementItem | null>(null);

  useEffect(() => {
    if (!authLoading && !permissionsLoading && user && !can('cashbox:view')) {
      router.push('/access-denied');
    }
  }, [user, authLoading, permissionsLoading, can, router]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [cashboxRes, statementRes, withdrawalsRes] = await Promise.all([
        api.get('/admin/app-cashbox'),
        api.get('/admin/app-cashbox/statement'),
        api.get('/admin/app-cashbox/withdrawals'),
      ]);
      if (!cashboxRes.data || typeof cashboxRes.data.balance !== 'number') throw new Error('caixa inválido');
      setData({
        cashbox: cashboxRes.data,
        statement: statementRes.data?.statement ?? [],
        withdrawals: withdrawalsRes.data?.withdrawals ?? [],
      });
    } catch {
      setData(null);
      setLoadError('Não deu para carregar os dados do caixa.');
    }
  }, []);

  useEffect(() => {
    if (!permissionsLoading && can('cashbox:view')) load();
    // mesmas dependências da página antiga (l. 76-80): recarrega quando o usuário ou as permissões mudam
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, permissionsLoading]);

  const canWithdraw = can('cashbox:withdraw');
  const canDeposit = can('cashbox:deposit');
  const canApprove = can('cashbox:approve_withdrawal');

  const withdrawAmount = parseAmount(withdrawForm.amount);
  const withdrawValid = withdrawAmount !== null && withdrawAmount > 0 && withdrawForm.bank.trim().length > 0;
  const depositAmount = parseAmount(deposit.amount);
  const depositValid = depositAmount !== null && depositAmount > 0;

  const submitWithdraw = async () => {
    if (!withdrawValid || withdrawAmount === null) return;
    try {
      await api.post('/admin/app-cashbox/withdrawal', {
        amount: withdrawAmount,
        reason: withdrawForm.reason,
        bankInfo: { bank: withdrawForm.bank, account: withdrawForm.account, holderName: withdrawForm.holderName },
      });
    } catch (err) {
      throw flattenServerError(err, 'Erro ao pedir a retirada');
    }
    setWithdrawOpen(false);
    setWithdrawForm(EMPTY_WITHDRAW);
    showToast('Retirada pedida. Ela aguarda aprovação.', 'success');
    await load();
  };

  const submitDeposit = async () => {
    if (!depositValid || depositAmount === null) return;
    try {
      await api.post('/admin/app-cashbox/deposit', { amount: depositAmount, reason: deposit.reason });
    } catch (err) {
      throw flattenServerError(err, 'Erro ao registrar o depósito');
    }
    setDepositOpen(false);
    setDeposit({ amount: '', reason: '' });
    showToast('Depósito registrado.', 'success');
    await load();
  };

  const submitApprove = async () => {
    if (!approving) return;
    try {
      await api.put(`/admin/app-cashbox/withdrawals/${approving._id}/approve`);
    } catch (err) {
      throw flattenServerError(err, 'Erro ao aprovar a retirada');
    }
    setApproving(null);
    showToast('Retirada aprovada.', 'success');
    await load();
  };

  const submitReject = async () => {
    if (!rejecting) return;
    try {
      await api.put(`/admin/app-cashbox/withdrawals/${rejecting._id}/reject`, { rejectionReason: rejectReason });
    } catch (err) {
      throw flattenServerError(err, 'Erro ao recusar a retirada');
    }
    setRejecting(null);
    setRejectReason('');
    showToast('Retirada recusada.', 'success');
    await load();
  };

  const statementColumns: AdminColumn<StatementItem>[] = [
    { key: 'origem', header: 'Origem', primary: true, render: (s) => sourceLabel(s.source) },
    { key: 'quando', header: 'Quando', render: (s) => dateTime(s.date) },
    {
      key: 'tipo', header: 'Tipo',
      render: (s) => <StatusTag tone={isIncome(s) ? 'ok' : 'neutral'}>{isIncome(s) ? 'Entrada' : 'Saída'}</StatusTag>,
    },
    { key: 'pedido', header: 'Pedido', render: (s) => (s.orderId ? `#${String(s.orderId).slice(-8)}` : '—') },
    {
      key: 'valor', header: 'Valor', align: 'right',
      render: (s) => `${isIncome(s) ? '+' : '−'}${formatMoney(s.amount)}`,
    },
  ];

  const withdrawalColumns: AdminColumn<CashWithdrawal>[] = [
    {
      key: 'para', header: 'Para', primary: true,
      render: (w) => (
        <span>
          {bankTitle(w)}
          {w.bankInfo?.account && <span className={ui.sub}>{w.bankInfo.account}</span>}
        </span>
      ),
    },
    { key: 'quando', header: 'Pedida em', render: (w) => dateTime(w.requestedAt) },
    {
      key: 'situacao', header: 'Situação',
      render: (w) => (
        <span>
          <StatusTag tone={WITHDRAWAL_STATUS[w.status]?.tone ?? 'neutral'}>{WITHDRAWAL_STATUS[w.status]?.label ?? w.status}</StatusTag>
          {w.rejectionReason && <span className={ui.sub}>{w.rejectionReason}</span>}
        </span>
      ),
    },
    { key: 'valor', header: 'Valor', align: 'right', render: (w) => formatMoney(w.amount) },
  ];

  const withdrawalAction = (w: CashWithdrawal) => {
    if (w.status !== 'pending' || !canApprove) return null;
    return (
      <div className={ui.rowActions}>
        <Button size="sm" className={ui.touch} onClick={() => setApproving(w)}>Aprovar</Button>
        <Button size="sm" variant="secondary" className={ui.touch} onClick={() => { setRejecting(w); setRejectReason(''); }}>
          Recusar
        </Button>
      </div>
    );
  };

  const actions = (canWithdraw || canDeposit) ? (
    <div className={blocks.actions}>
      {canWithdraw && <Button className={ui.touch} onClick={() => setWithdrawOpen(true)}>Pedir retirada</Button>}
      {canDeposit && <Button variant="secondary" className={ui.touch} onClick={() => setDepositOpen(true)}>Registrar depósito</Button>}
    </div>
  ) : undefined;

  const pendingCount = data ? data.withdrawals.filter((w) => w.status === 'pending').length : 0;
  const orderedWithdrawals = data
    ? [...data.withdrawals].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'))
    : [];
  const c = data?.cashbox;

  return (
    <ProtectedRoute required_permission="cashbox:view">
      <AdminShell title="Dinheiro · Caixa" tabs="dinheiro" actions={actions}>
        {loadError ? (
          <LoadError message={loadError} onRetry={load} />
        ) : !data || !c ? (
          <LoadSkeleton lines={6} />
        ) : (
          <div className={ui.stack}>
            {c.asaas?.enabled && (
              <section className={blocks.block} aria-label="Conta-mãe Asaas">
                <Kpi
                  label="Saldo real · conta-mãe Asaas"
                  value={c.asaas.balance != null ? formatMoney(c.asaas.balance) : 'Indisponível'}
                  hint={c.asaas.error
                    ? `Não deu para consultar o Asaas: ${c.asaas.error}`
                    : 'Neste modo a custódia e os repasses ficam no Asaas; os números abaixo são contábeis.'}
                />
              </section>
            )}

            <div className={blocks.kpis}>
              <Kpi label="Lucro líquido do DROP" value={money(c.platformNet)} hint="Só as comissões que a plataforma recebe" />
              <Kpi label="Obrigações pendentes" value={money(c.pendingObligations)} hint="Repasses e saques ainda a pagar" />
              <Kpi label="Custódia total" value={money(c.balance)} hint="Entrou e será repassado" />
              <Kpi label="Renda total" value={money(c.totalIncome)} />
              <Kpi label="Saídas totais" value={money(c.totalExpenses)} />
            </div>

            {pendingCount > 0 && (
              <Alert tone="warning" title={pendingCount === 1 ? '1 retirada aguardando aprovação' : `${pendingCount} retiradas aguardando aprovação`}>
                {canApprove ? 'Aprove ou recuse na lista de retiradas.' : 'Quem tem a permissão de aprovar retiradas decide.'}
              </Alert>
            )}

            <section className={blocks.block} aria-label="Retiradas">
              <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Retiradas</h2></div>
              <AdminTable
                columns={withdrawalColumns}
                rows={orderedWithdrawals}
                rowKey={(w) => w._id}
                rowLabel={(w) => bankTitle(w)}
                rowAction={withdrawalAction}
                empty="Nenhuma retirada pedida"
              />
            </section>

            <section className={blocks.block} aria-label="Extrato do caixa">
              <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Extrato do caixa</h2></div>
              <AdminTable
                columns={statementColumns}
                rows={data.statement}
                rowKey={statementKey}
                onRowClick={(s) => setDetail(s)}
                empty="Sem movimentos ainda"
              />
            </section>
          </div>
        )}

        <AdminSheet
          open={withdrawOpen}
          title="Pedir retirada"
          onClose={() => setWithdrawOpen(false)}
          primary={{ label: 'Pedir retirada', disabled: !withdrawValid, onClick: submitWithdraw }}
        >
          <p className={blocks.muted}>A retirada fica aguardando aprovação de quem pode aprovar retiradas.</p>
          <Input
            label="Valor (R$)"
            value={withdrawForm.amount}
            onChange={(v) => setWithdrawForm({ ...withdrawForm, amount: v })}
            placeholder="0,00"
            inputMode="decimal"
            error={amountFieldError(withdrawForm.amount)}
          />
          {withdrawAmount !== null && withdrawAmount > 0 && (
            <p className={blocks.muted}>{`Será retirado: ${formatMoney(withdrawAmount)}`}</p>
          )}
          <Input label="Banco" value={withdrawForm.bank} onChange={(v) => setWithdrawForm({ ...withdrawForm, bank: v })} placeholder="ex: Banco do Brasil" />
          <Input label="Agência / conta" value={withdrawForm.account} onChange={(v) => setWithdrawForm({ ...withdrawForm, account: v })} placeholder="ex: 1234-5 / 123456789-0" />
          <Input label="Titular da conta" value={withdrawForm.holderName} onChange={(v) => setWithdrawForm({ ...withdrawForm, holderName: v })} placeholder="Nome" />
          <TextAreaField label="Motivo (opcional)" value={withdrawForm.reason} onChange={(v) => setWithdrawForm({ ...withdrawForm, reason: v })} placeholder="Motivo do saque..." />
        </AdminSheet>

        <AdminSheet
          open={depositOpen}
          title="Registrar depósito"
          onClose={() => setDepositOpen(false)}
          primary={{ label: 'Registrar depósito', disabled: !depositValid, onClick: submitDeposit }}
        >
          <Input
            label="Valor (R$)"
            value={deposit.amount}
            onChange={(v) => setDeposit({ ...deposit, amount: v })}
            placeholder="0,00"
            inputMode="decimal"
            error={amountFieldError(deposit.amount)}
          />
          {depositAmount !== null && depositAmount > 0 && (
            <p className={blocks.muted}>{`Será registrado: ${formatMoney(depositAmount)}`}</p>
          )}
          <TextAreaField label="Motivo / descrição" value={deposit.reason} onChange={(v) => setDeposit({ ...deposit, reason: v })} placeholder="Descrição do depósito..." />
        </AdminSheet>

        <AdminSheet
          open={!!approving}
          title="Aprovar retirada"
          onClose={() => setApproving(null)}
          primary={{ label: 'Confirmar aprovação', onClick: submitApprove }}
        >
          {approving && (
            <p className={blocks.muted}>
              {formatMoney(approving.amount)} para {bankTitle(approving)}
              {approving.bankInfo?.account ? ` (${approving.bankInfo.account})` : ''}. O valor sai do caixa da plataforma.
            </p>
          )}
        </AdminSheet>

        <AdminSheet
          open={!!rejecting}
          title="Recusar retirada"
          onClose={() => setRejecting(null)}
          primary={{ label: 'Recusar retirada', tone: 'danger', disabled: !rejectReason.trim(), onClick: submitReject }}
        >
          {rejecting && <p className={blocks.muted}>{formatMoney(rejecting.amount)} para {bankTitle(rejecting)}.</p>}
          <TextAreaField label="Motivo da recusa" value={rejectReason} onChange={setRejectReason} placeholder="Ex.: conta de destino errada" />
        </AdminSheet>

        <AdminSheet open={!!detail} title={detail ? sourceLabel(detail.source) : ''} onClose={() => setDetail(null)} secondaryLabel="Fechar">
          {detail && (
            <dl className={ui.detail}>
              <div><dt>Valor</dt><dd>{`${isIncome(detail) ? '+' : '−'}${formatMoney(Number(detail.amount || 0))}`}</dd></div>
              <div><dt>Tipo</dt><dd>{isIncome(detail) ? 'Entrada' : 'Saída'}</dd></div>
              <div>
                <dt>Data e hora</dt>
                <dd>{new Date(detail.date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</dd>
              </div>
              {detail.reason && <div><dt>Motivo / descrição</dt><dd>{detail.reason}</dd></div>}
              {detail.orderId && (
                <div>
                  <dt>Pedido</dt>
                  <dd><Link href={`/order/${detail.orderId}`} className={ui.link}>{`#${String(detail.orderId).slice(-8)}`}</Link></dd>
                </div>
              )}
              {detail.deliveryId && <div><dt>Entrega</dt><dd className={ui.mono}>{`#${String(detail.deliveryId).slice(-8)}`}</dd></div>}
              {detail.withdrawalId && <div><dt>Retirada</dt><dd className={ui.mono}>{`#${String(detail.withdrawalId).slice(-8)}`}</dd></div>}
              {detail._id && <div><dt>ID da transação</dt><dd className={ui.mono}>{String(detail._id)}</dd></div>}
            </dl>
          )}
        </AdminSheet>
      </AdminShell>
    </ProtectedRoute>
  );
}
