/**
 * Dinheiro · Carteiras (DS v2, D3a, tela 17; D3b-3). Consulta de carteiras; o extrato pede a aprovação da pessoa.
 * GET /admin/wallets · GET /wallet-access/outgoing · GET /admin/wallets/:id/transactions ·
 * POST /wallet-access/request { targetUserId, reason } ·
 * POST /admin/wallets/:id/adjust { direction, amount, reason, idempotencyKey } (D3b-3: "Ajustar saldo", que substitui
 * o antigo "Adicionar saldo"). Só o CEO com wallet:credit (não delegável); o ajuste fica no Histórico do Dinheiro.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { AdminTable, type AdminColumn } from '../../components/admin/AdminTable';
import { AdminSheet } from '../../components/admin/AdminSheet';
import { Kpi } from '../../components/admin/Kpi';
import blocks from '../../components/admin/AdminBlocks.module.css';
import { LoadError } from '../../components/admin/LoadState';
import { StatusTag } from '../../components/admin/StatusTag';
import ui from '../../components/admin/dinheiro/Dinheiro.module.css';
import { TextAreaField } from '../../components/admin/dinheiro/TextAreaField';
import { flattenServerError } from '../../components/admin/dinheiro/serverError';
import { AdjustBalanceSheet } from '../../components/admin/dinheiro/AdjustBalanceSheet';
import {
  isCreditEntry, paymentMethodLabel, transactionLabel, transactionStatus, type WalletTransaction,
} from '../../components/admin/dinheiro/walletLabels';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import type { WalletAdjustResponse } from '../../lib/adminMoney';
import { formatMoney } from '../../lib/money';

interface WalletRow {
  _id: string;
  owner: string;
  userId?: string;
  balance: number | null;
  totalSpent?: number | null;
  totalWithdrawn?: number | null;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  hasAccess?: boolean;
}

interface AccessRequest {
  _id: string;
  targetUserId: string | { _id?: string } | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'revoked';
  reason: string;
  expiresAt: string | null;
  createdAt: string;
}

const ROLE_OPTIONS = [
  { value: 'all', label: 'Todos os papéis' },
  { value: 'cliente', label: 'Clientes' },
  { value: 'lojista', label: 'Lojistas' },
  { value: 'motoboy', label: 'Motoboys' },
  { value: 'ceo', label: 'CEOs' },
];
/** Por público (22/10): o filtro oferece só os tipos das chaves da conta; o servidor já manda só esses. */
const ROLE_PERMISSION: Record<string, string> = {
  cliente: 'wallet:view_clients', lojista: 'wallet:view_stores', motoboy: 'wallet:view_motoboys', ceo: 'wallet:view_all',
};
const ROLE_LABEL: Record<string, string> = { cliente: 'Cliente', lojista: 'Loja', motoboy: 'Motoboy', ceo: 'CEO' };
const HIDDEN = '••••';

const targetOf = (w: WalletRow) => String(w.userId || w.owner);
const requestTarget = (r: AccessRequest) =>
  String(typeof r.targetUserId === 'string' ? r.targetUserId : r.targetUserId?._id);
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const when = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const txKey = (t: WalletTransaction) => t._id ?? `${t.createdAt}|${t.amount}|${t.reason ?? ''}`;

export default function AdminWalletsPage() {
  const { user, can } = useAuth();
  const isCeo = (user?.activeRole || user?.role) === 'ceo';
  // wallet:credit é só do CEO e não é delegável (o servidor confere de novo).
  const canAdjust = isCeo && can('wallet:credit');
  const { showToast } = useToast();

  const [wallets, setWallets] = useState<WalletRow[] | null>(null);
  const [walletsError, setWalletsError] = useState<string | null>(null);
  const [outgoing, setOutgoing] = useState<AccessRequest[]>([]);
  const [outgoingError, setOutgoingError] = useState(false);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [selected, setSelected] = useState<WalletRow | null>(null);
  const [txs, setTxs] = useState<WalletTransaction[] | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [requestFor, setRequestFor] = useState<WalletRow | null>(null);
  const [reason, setReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const loadOutgoing = useCallback(async () => {
    try {
      const res = await api.get('/wallet-access/outgoing');
      setOutgoing(res.data?.requests || []);
      setOutgoingError(false);
    } catch {
      setOutgoingError(true);
    }
  }, []);

  const loadWallets = useCallback(async () => {
    setWalletsError(null);
    setWallets(null);
    try {
      const res = await api.get('/admin/wallets');
      if (!Array.isArray(res.data)) throw new Error('lista de carteiras inválida');
      setWallets(res.data);
    } catch {
      setWalletsError('Não deu para carregar as carteiras.');
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadOutgoing();
    loadWallets();
  }, [user, loadOutgoing, loadWallets]);

  const lastRequest = (w: WalletRow): AccessRequest | null => {
    const mine = outgoing.filter((r) => requestTarget(r) === targetOf(w));
    if (!mine.length) return null;
    return [...mine].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  };

  // Só a última leitura vale: abrir outra carteira antes da resposta descarta a anterior (nunca o extrato de outra pessoa).
  const txRequest = useRef(0);
  const loadTransactions = async (w: WalletRow) => {
    const id = ++txRequest.current;
    setTxs(null);
    setTxError(null);
    try {
      const res = await api.get(`/admin/wallets/${w._id}/transactions`);
      if (id !== txRequest.current) return;
      setTxs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (id !== txRequest.current) return;
      if ((err as { response?: { status?: number } })?.response?.status === 403) {
        setTxError('Acesso expirado. Peça acesso de novo.');
        await loadOutgoing();
      } else {
        setTxError('Não deu para carregar o extrato.');
      }
    }
  };

  const openWallet = (w: WalletRow) => {
    if (!w.hasAccess) {
      setRequestFor(w);
      setReason('');
      return;
    }
    setSelected(w);
    setAdjusting(false);
    void loadTransactions(w);
  };

  const submitRequest = async () => {
    if (!requestFor) return;
    try {
      await api.post('/wallet-access/request', {
        targetUserId: requestFor.userId || requestFor.owner,
        reason: reason.trim(),
      });
    } catch (err) {
      throw flattenServerError(err, 'Não deu para enviar o pedido.');
    }
    setRequestFor(null);
    setReason('');
    showToast('Pedido enviado. A pessoa precisa aprovar.', 'success');
    await loadOutgoing();
  };

  const patchBalance = (walletId: string, balance: number) => {
    const patch = (w: WalletRow) => (w._id === walletId ? { ...w, balance } : w);
    setSelected((s) => (s ? patch(s) : s));
    setWallets((ws) => (ws ? ws.map(patch) : ws));
  };

  const onAdjusted = async ({ replayed, adjustment }: WalletAdjustResponse) => {
    if (!selected) return;
    const target = selected;
    setAdjusting(false);
    patchBalance(target._id, adjustment.balanceAfter);
    showToast(
      replayed
        ? `Este ajuste já estava registrado. Saldo: ${formatMoney(adjustment.balanceAfter)}.`
        : `Saldo ajustado. Saldo agora: ${formatMoney(adjustment.balanceAfter)}.`,
      'success',
    );
    await loadTransactions({ ...target, balance: adjustment.balanceAfter });
  };

  const roleOptions = ROLE_OPTIONS.filter((o) => o.value === 'all' || can('wallet:view_all') || can(ROLE_PERMISSION[o.value]));
  const term = search.trim().toLowerCase();
  const visible = wallets === null ? null : wallets.filter((w) => {
    const matchRole = role === 'all' || w.userRole === role;
    const matchSearch = !term
      || !!w.userName?.toLowerCase().includes(term)
      || !!w.userEmail?.toLowerCase().includes(term);
    return matchRole && matchSearch;
  });

  const columns: AdminColumn<WalletRow>[] = [
    {
      key: 'pessoa', header: 'Pessoa', primary: true,
      render: (w) => (
        <span>
          {w.userName || 'Sem nome'}
          <span className={ui.sub}>{w.userEmail || 'Sem e-mail'}</span>
        </span>
      ),
    },
    { key: 'papel', header: 'Papel', render: (w) => ROLE_LABEL[w.userRole ?? ''] ?? w.userRole ?? '—' },
    {
      key: 'saldo', header: 'Saldo', align: 'right',
      render: (w) => (w.hasAccess ? formatMoney(w.balance || 0) : <span aria-label="Saldo oculto">{HIDDEN}</span>),
    },
    {
      key: 'gastos', header: 'Gastos', align: 'right',
      render: (w) => (w.hasAccess ? formatMoney(w.totalSpent || 0) : <span aria-label="Gastos ocultos">{HIDDEN}</span>),
    },
  ];

  const rowAction = (w: WalletRow) => {
    const req = lastRequest(w);
    if (w.hasAccess) {
      const label = req?.status === 'approved' && req.expiresAt ? `Ver extrato · até ${hhmm(req.expiresAt)}` : 'Ver extrato';
      return (
        <Button size="sm" variant={selected?._id === w._id ? 'primary' : 'secondary'} className={ui.touch} onClick={() => openWallet(w)}>
          {label}
        </Button>
      );
    }
    if (req?.status === 'pending') {
      return <Button size="sm" variant="secondary" className={ui.touch} disabled>Aguardando resposta</Button>;
    }
    const label = req?.status === 'rejected'
      ? 'Recusado · pedir de novo'
      : req?.status === 'expired' || req?.status === 'revoked' ? 'Pedir de novo' : 'Pedir acesso';
    return <Button size="sm" variant="secondary" className={ui.touch} onClick={() => openWallet(w)}>{label}</Button>;
  };

  const txColumns: AdminColumn<WalletTransaction>[] = [
    {
      key: 'movimento', header: 'Movimento', primary: true,
      render: (t) => `${transactionLabel(t)}${t.paymentMethod ? ` via ${paymentMethodLabel(t.paymentMethod)}` : ''}`,
    },
    { key: 'quando', header: 'Quando', render: (t) => when(t.createdAt) },
    { key: 'origem', header: 'Origem', render: (t) => t.reason || '—' },
    {
      key: 'situacao', header: 'Situação',
      render: (t) => {
        const s = transactionStatus(t);
        return <StatusTag tone={s.tone}>{s.label}</StatusTag>;
      },
    },
    {
      key: 'valor', header: 'Valor', align: 'right',
      render: (t) => `${isCreditEntry(t) ? '+' : '−'}${formatMoney(t.amount)}`,
    },
  ];

  return (
    <ProtectedRoute required_permission={['wallet:view_all', 'wallet:view_clients', 'wallet:view_stores', 'wallet:view_motoboys']}>
      <AdminShell title="Dinheiro · Carteiras" tabs="dinheiro">
        <div className={ui.stack}>
          <p className={blocks.muted}>
            Página de consulta. No modo Asaas, o dinheiro de pedidos e repasses fica nas subcontas do gateway,
            não nesta carteira. Ver o extrato de alguém pede a aprovação da pessoa.
          </p>

          {outgoingError && (
            <LoadError
              message="Não deu para ler os seus pedidos de acesso. A situação de cada pedido pode estar desatualizada."
              onRetry={loadOutgoing}
            />
          )}

          <div className={ui.split}>
            <section className={blocks.block} aria-label="Carteiras">
              <div className={ui.toolbar}>
                <Input label="Buscar" value={search} onChange={setSearch} placeholder="Nome ou e-mail" />
                <Select label="Papel" value={role} onChange={setRole} options={roleOptions} />
              </div>
              <AdminTable
                columns={columns}
                rows={visible}
                rowKey={(w) => w._id}
                rowLabel={(w) => w.userName || 'carteira'}
                error={walletsError}
                onRetry={loadWallets}
                empty="Nenhuma carteira encontrada"
                rowAction={rowAction}
                caption={wallets ? `${wallets.length} carteiras no sistema` : undefined}
              />
            </section>

            {selected && (
              <section className={blocks.block} aria-label={`Carteira de ${selected.userName || 'usuário'}`}>
                <div className={blocks.blockHead}>
                  <h2 className={blocks.blockTitle}>{selected.userName || 'Usuário'}</h2>
                  {canAdjust && (
                    <Button size="sm" variant="secondary" className={ui.touch} onClick={() => setAdjusting(true)}>
                      Ajustar saldo
                    </Button>
                  )}
                </div>
                <p className={blocks.muted}>{selected.userEmail || 'Sem e-mail'}</p>
                <div className={blocks.kpis}>
                  <Kpi label="Saldo" value={formatMoney(selected.balance || 0)} />
                  <Kpi label="Gasto total" value={formatMoney(selected.totalSpent || 0)} />
                  <Kpi label="Saques" value={formatMoney(selected.totalWithdrawn || 0)} />
                </div>
                <h3 className={blocks.blockTitle}>Extrato</h3>
                <AdminTable
                  columns={txColumns}
                  rows={txs}
                  rowKey={txKey}
                  error={txError}
                  onRetry={() => loadTransactions(selected)}
                  empty="Nenhuma movimentação ainda"
                />
              </section>
            )}
          </div>
        </div>

        <AdminSheet
          open={!!requestFor}
          title="Pedir acesso à carteira"
          onClose={() => setRequestFor(null)}
          primary={{ label: 'Enviar pedido', disabled: reason.trim().length < 5, onClick: submitRequest }}
        >
          <p className={blocks.muted}>
            Pessoa: <strong>{requestFor?.userName || 'Sem nome'}</strong>. O pedido vai com a sua justificativa e a
            pessoa precisa aprovar. O acesso aprovado vale por 24 horas.
          </p>
          <TextAreaField
            label="Justificativa (mínimo 5 caracteres)"
            value={reason}
            onChange={setReason}
            placeholder="Ex.: investigando reclamação #123 sobre débito indevido..."
            rows={4}
          />
        </AdminSheet>

        <AdjustBalanceSheet
          target={adjusting && selected
            ? { walletId: selected._id, name: selected.userName || 'Usuário', balance: selected.balance || 0 }
            : null}
          onClose={() => setAdjusting(false)}
          onAdjusted={onAdjusted}
          onBalanceKnown={(available) => { if (selected) patchBalance(selected._id, available); }}
        />
      </AdminShell>
    </ProtectedRoute>
  );
}
