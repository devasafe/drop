import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { ArrowUpRight, KeyRound, Receipt, HelpCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import { Button } from '../../components/ui/Button';
import WithdrawSheet from '../../components/wallet/WithdrawSheet';
import LegacyBalanceCard from '../../components/wallet/LegacyBalanceCard';
import { useCustodyLeftover } from '../../hooks/useCustodyLeftover';
import { useSaasConfig } from '../../hooks/useSaasConfig';
import WalletMetrics, { EarningsSummary } from '../../components/wallet/WalletMetrics';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatBRL } from '../../components/ui/PriceTag';
import { useToast } from '../../components/ui/Toast';
import TransactionDetailsModal, { DetailRow } from '../../components/TransactionDetailsModal';
import { payoutStatusView } from '../../lib/deliveryStatus';
import styles from './MotoboyWallet.module.css';

interface MototboyWallet {
  _id: string; owner: string; ownerType: 'user';
  balance: number; totalIncome: number; totalSpent: number;
  availableBalance: number; pendingBalance: number;
  freeDeliveriesAvailable?: number; discountPercentage?: number;
}
interface PayoutItem {
  _id: string; amount: number;
  status: 'pending' | 'released' | 'requested' | 'paid' | 'cancelled';
  orderId: string; deliveryId?: string; createdAt: string;
}
interface TransferItem {
  id: string; orderId: string; amount: number; status: string; createdAt: string; doneAt?: string | null;
}
interface HistoryItem {
  date: string; type: 'credit' | 'debit'; amount: number; reason: string; relatedId?: string;
}

type PillTone = 'pending' | 'available' | 'requested' | 'paid' | 'cancelled';
function withdrawalStatusView(status: string): { label: string; tone: PillTone } {
  switch (status) {
    case 'processed': return { label: 'Pago', tone: 'paid' };
    case 'rejected': return { label: 'Rejeitado', tone: 'cancelled' };
    case 'approved': return { label: 'Aprovado', tone: 'available' };
    default: return { label: 'Solicitado', tone: 'pending' };
  }
}

export default function MototboyWalletPage() {
  const { user } = useAuth();
  // Modo direto com saldo da custódia (o backend decide); na custódia → false.
  const custodyLeftover = useCustodyLeftover();
  const { settlementMode, loading: modeLoading } = useSaasConfig();
  // No modo direto não existe carteira/payout/saque (as rotas dão 404): só os Pix recebidos da loja.
  // Exceção: saldo antigo da custódia mantém a página como na custódia.
  const showWallet = settlementMode !== 'direto' || custodyLeftover;
  const router = useRouter();
  const { showToast } = useToast();
  const [transferring, setTransferring] = useState(false);
  const [sacarOpen, setSacarOpen] = useState(false);
  const [wallet, setWallet] = useState<MototboyWallet | null>(null);
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  // Paginação por cursor das transferências diretas (null = acabou).
  const [transfersCursor, setTransfersCursor] = useState<string | null>(null);
  const [loadingMoreTransfers, setLoadingMoreTransfers] = useState(false);
  // Geração da consulta: recarregar a carteira invalida um "Carregar mais" em voo.
  const transfersGen = useRef(0);
  const [extractFilter, setExtractFilter] = useState<'todos' | 'ganhos' | 'saques'>('todos');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<
    | { kind: 'payout'; data: PayoutItem; orderInfo?: any; invoice?: any }
    | { kind: 'history'; data: HistoryItem }
    | null
  >(null);

  const payoutStatusLabel = (s: PayoutItem['status']) => payoutStatusView(s).label;

  const refetchWallet = async (motoboyId: string) => {
    const walletRes = await api.get(`/wallets/motoboy/${motoboyId}`);
    setWallet(walletRes.data);
    try {
      const payoutsRes = await api.get('/payouts/my');
      setPayouts(payoutsRes.data.payouts || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (modeLoading) return;
    const fetchWallet = async () => {
      const gen = ++transfersGen.current;
      try {
        const motoboyId = user?._id || user?.id;
        if (!motoboyId) return;
        setFetchError(null);
        if (showWallet) {
        const walletRes = await api.get(`/wallets/motoboy/${motoboyId}`);
        setWallet(walletRes.data);
        try {
          const historyRes = await api.get(`/wallets/${motoboyId}/history?limit=30`);
          setHistory(historyRes.data.history || []);
        } catch { /* history opcional */ }
        try {
          const payoutsRes = await api.get('/payouts/my');
          setPayouts(payoutsRes.data.payouts || []);
        } catch { /* ignore */ }
        try {
          const sumRes = await api.get('/payouts/my/summary');
          setSummary(sumRes.data);
        } catch { /* resumo opcional */ }
        }
        try {
          // Modo direto: a loja paga o motoboy por Pix; só "Recebido" ou "pendente" (sem códigos internos).
          const trRes = await api.get('/motoboy/transfers');
          if (gen !== transfersGen.current) return;
          setTransfers(Array.isArray(trRes.data?.data) ? trRes.data.data : []);
          setTransfersCursor(trRes.data?.nextCursor ?? null);
        } catch { /* sem transferências diretas */ }
        if (showWallet) {
          try {
            const wdRes = await api.get('/withdrawals/my-withdrawals');
            setWithdrawals(Array.isArray(wdRes.data) ? wdRes.data : (wdRes.data?.withdrawals || []));
          } catch { /* saques opcional */ }
        }
      } catch (err: any) {
        const status = err?.response?.status;
        const msg = err?.response?.data?.error || err?.message || 'Erro desconhecido';
        setFetchError(`[${status ?? 'NET'}] ${msg}`);
      } finally {
        setLoading(false);
      }
    };
    fetchWallet();
  }, [(user?._id || user?.id), modeLoading, showWallet]);

  const handlePayoutClick = async (p: PayoutItem) => {
    setSelectedTx({ kind: 'payout', data: p });
    if (!p.orderId) return;
    const updates: Partial<{ orderInfo: any; invoice: any }> = {};
    await Promise.all([
      api.get(`/orders/${p.orderId}`).then(r => { updates.orderInfo = r.data; }).catch(() => {}),
      api.get(`/invoices/by-order/${p.orderId}`).then(r => { updates.invoice = r.data; }).catch(() => {}),
    ]);
    setSelectedTx(prev => (prev?.kind === 'payout' && prev.data._id === p._id ? { ...prev, ...updates } : prev));
  };

  const available = wallet?.availableBalance ?? wallet?.balance ?? 0;
  // Saldo do modo anterior: repasses `released` (o saque por payouts consome exatamente esses).
  const releasedTotal = Math.round(payouts.filter((p) => p.status === 'released').reduce((s, p) => s + Number(p.amount), 0) * 100) / 100;

  const confirmarSaque = async (amount: number | 'all') => {
    const motoboyId = user?._id || user?.id;
    if (!motoboyId || available <= 0) return;
    setTransferring(true);
    try {
      const res = await api.post('/withdrawals/request', { amount });
      const done = res.data?.withdrawal?.amount;
      showToast(
        done ? `Saque de ${formatBRL(done)} solicitado! Cai na sua chave PIX.` : 'Saque solicitado! O valor cai na sua chave PIX cadastrada.',
        'success',
      );
      setSacarOpen(false);
      await refetchWallet(motoboyId);
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Erro ao solicitar saque. Confira sua chave PIX em Dados de recebimento.', 'error');
    } finally {
      setTransferring(false);
    }
  };

  const loadMoreTransfers = async () => {
    if (!transfersCursor || loadingMoreTransfers) return;
    const gen = transfersGen.current;
    setLoadingMoreTransfers(true);
    try {
      const r = await api.get('/motoboy/transfers', { params: { cursor: transfersCursor } });
      if (gen !== transfersGen.current) return; // carteira recarregada: resposta da lista antiga
      const more: TransferItem[] = Array.isArray(r.data?.data) ? r.data.data : [];
      setTransfers((prev) => [...prev, ...more.filter((m) => !prev.some((p) => p.id === m.id))]);
      setTransfersCursor(r.data?.nextCursor ?? null);
    } catch {
      showToast('Não foi possível carregar mais pagamentos.', 'error');
    } finally {
      setLoadingMoreTransfers(false);
    }
  };

  // Extrato unificado: repasses (crédito) + saques (débito), mais recente primeiro.
  const entries = [
    ...(showWallet ? payouts : []).map((p) => ({
      key: `p-${p._id}`, date: p.createdAt, sign: '+' as const, amount: p.amount,
      title: `Entrega #${p.orderId?.slice(-6) || '—'}`, statusView: payoutStatusView(p.status),
      // Repasse leva ao detalhe da entrega (com tudo). Sem deliveryId, cai no modal.
      onClick: () => p.deliveryId ? router.push(`/motoboy/delivery/${p.deliveryId}`) : handlePayoutClick(p),
    })),
    ...transfers.map((t) => ({
      key: `t-${t.id}`, date: t.doneAt || t.createdAt, sign: '+' as const, amount: t.amount,
      title: `Entrega #${t.orderId?.slice(-6) || '—'}`,
      statusView: (t.status === 'done'
        ? { label: 'Recebido', tone: 'paid' }
        : { label: 'Pagamento pendente da loja', tone: 'pending' }) as { label: string; tone: PillTone },
      onClick: undefined as undefined | (() => void),
    })),
    ...(showWallet ? withdrawals : []).map((w: any, i: number) => {
      const wv = withdrawalStatusView(w.status);
      return {
        key: `w-${w._id || w.id || i}`, date: w.requestedAt || w.createdAt, sign: '-' as const, amount: Number(w.amount),
        title: 'Saque via PIX', statusView: wv,
        note: w.status === 'rejected' && w.rejectionReason ? `Motivo: ${w.rejectionReason}` : undefined,
        onClick: undefined as undefined | (() => void),
      };
    }),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (loading || modeLoading) {
    return (
      <ProtectedRoute required_role="motoboy">
        <div className={styles.page}><div className={styles.container}>
          <Skeleton height={140} radius="var(--r-xl)" />
          <Skeleton height={80} radius="var(--r-lg)" />
          <Skeleton height={200} radius="var(--r-lg)" />
        </div></div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute required_role="motoboy">
      <div className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>{showWallet ? 'Ganhos e saques' : 'Repasses recebidos'}</h1>

          {fetchError && <div className={styles.error}>Erro ao carregar carteira: {fetchError}</div>}

          {/* Card de saldo */}
          {showWallet && (<>
          <div className={styles.balanceCard}>
            <span className={styles.balanceGlow} aria-hidden="true" />
            <div className={styles.balanceTop}>
              <span className={styles.balanceLabel}>Disponível para saque</span>
              <span className={styles.balanceBadge}><ArrowUpRight size={17} aria-hidden="true" /></span>
            </div>
            <span className={styles.balanceValue}>{formatBRL(available)}</span>
            <Button variant="accent" className={styles.sacarBtn} onClick={() => setSacarOpen(true)} disabled={available <= 0}>
              <ArrowUpRight size={17} aria-hidden="true" /> Sacar para meu PIX
            </Button>
          </div>

          {/* Saldo do modo anterior (R26): só no modo direto, sai pelo saque por payouts */}
          {custodyLeftover && <LegacyBalanceCard amount={releasedTotal} onWithdraw={() => setSacarOpen(true)} />}

          {/* Resumo financeiro (buckets agregados no backend) */}
          {summary && <WalletMetrics summary={summary} />}
          </>)}

          {/* Dados de recebimento (item configurável discreto) */}
          {showWallet && (
          <button className={styles.pixRow} onClick={() => router.push('/dados-recebimento')}>
            <span className={styles.pixIcon}><KeyRound size={16} aria-hidden="true" /></span>
            <span className={styles.pixText}>
              <span className={styles.pixTitle}>Dados de recebimento</span>
              <span className={styles.pixDesc}>Configure sua chave PIX para receber seus saques.</span>
            </span>
            <ArrowUpRight size={16} aria-hidden="true" className={styles.pixChevron} />
          </button>
          )}

          {/* Extrato */}
          <section className={styles.section}>
            <div className={styles.extractHead}>
              <h2 className={styles.sectionTitle}>{showWallet ? 'Extrato' : 'Pix recebidos das lojas'}</h2>
              {showWallet && (<div className={styles.extractFilters}>
                {(['todos', 'ganhos', 'saques'] as const).map((f) => (
                  <button
                    key={f}
                    className={`${styles.filterChip} ${extractFilter === f ? styles.filterChipActive : ''}`}
                    onClick={() => setExtractFilter(f)}
                  >
                    {f === 'todos' ? 'Todos' : f === 'ganhos' ? 'Ganhos' : 'Saques'}
                  </button>
                ))}
              </div>)}
            </div>
            {(() => {
              const filtered = entries.filter((e) =>
                extractFilter === 'todos' ? true : extractFilter === 'ganhos' ? e.sign === '+' : e.sign === '-',
              );
              return filtered.length === 0 ? (
              <EmptyState icon={<Receipt size={22} aria-hidden="true" />} title="Nenhuma movimentação" description={showWallet ? 'Seus repasses e saques aparecem aqui.' : 'Os Pix que as lojas enviarem por suas entregas aparecem aqui.'} />
            ) : (
              <div className={styles.extractList}>
                {filtered.map((e) => (
                  <button key={e.key} onClick={e.onClick} className={styles.row}>
                    <div className={styles.rowInfo}>
                      <span className={styles.rowTitle}>{e.title}</span>
                      <span className={styles.rowDate}>{new Date(e.date).toLocaleDateString('pt-BR')}</span>
                      {(e as any).note && <span className={styles.rowNote}>{(e as any).note}</span>}
                    </div>
                    <div className={styles.rowRight}>
                      <span className={`${styles.rowAmount} ${e.sign === '+' ? styles.credit : styles.debit}`}>
                        {e.sign} {formatBRL(e.amount)}
                      </span>
                      <span className={`${styles.pill} ${styles[e.statusView.tone]}`}>{e.statusView.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            );
            })()}
            {transfersCursor && extractFilter !== 'saques' && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-3)' }}>
                <Button variant="ghost" loading={loadingMoreTransfers} onClick={loadMoreTransfers}>Carregar mais</Button>
              </div>
            )}
          </section>

          {/* Ajuda */}
          {showWallet && (
          <button className={styles.helpLink} onClick={() => router.push('/motoboy/ajuda-ganhos')}>
            <HelpCircle size={15} aria-hidden="true" />
            <span>Entenda como funcionam os ganhos e saques</span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
          )}
        </div>
      </div>

      {/* Saque com valor editável (respeita limite diário) */}
      <WithdrawSheet
        open={sacarOpen}
        onClose={() => setSacarOpen(false)}
        available={available}
        submitting={transferring}
        onConfirm={confirmarSaque}
      />

      {selectedTx?.kind === 'payout' && (() => {
        const p = selectedTx.data;
        const oi = selectedTx.orderInfo;
        const invoice = selectedTx.invoice;
        const link = (text: string, href: string) => (
          <a href={href} onClick={(e) => { e.preventDefault(); router.push(href); }} className={styles.txLink}>{text}</a>
        );
        const details: DetailRow[] = [];
        if (invoice?._id) details.push({ label: 'Nota de Serviço', value: link(invoice.invoiceNumber || 'Ver nota', `/invoice/${invoice._id}`) });
        details.push({ label: 'Pedido', value: link(`#${p.orderId?.slice(-6)}`, `/order/${p.orderId}`) });
        if (oi?.storeName || oi?.storeObj?.name) {
          details.push({ label: 'Loja', value: oi.storeObj?.name || oi.storeName });
          if (oi.storeObj?.address) details.push({ label: 'Endereço Loja', value: oi.storeObj.address });
        }
        if (oi?.customerName || oi?.customerObj?.name) details.push({ label: 'Cliente', value: oi.customerObj?.name || oi.customerName });
        const addr = oi?.customerAddress || oi?.customerObj?.mainAddress || oi?.customerObj?.addresses?.[0];
        if (addr) details.push({ label: 'Entrega em', value: `${addr.street || ''}, ${addr.number || ''}, ${addr.neighborhood || ''}, ${addr.city || ''}` });
        if (oi?.deliveryDistance) details.push({ label: 'Distância', value: `${oi.deliveryDistance.toFixed(1)} km` });
        if (oi?.delivery) {
          if (oi.delivery.pickedAt) details.push({ label: 'Retirado', value: new Date(oi.delivery.pickedAt).toLocaleString('pt-BR') });
          if (oi.delivery.deliveredAt) details.push({ label: 'Entregue', value: new Date(oi.delivery.deliveredAt).toLocaleString('pt-BR'), highlight: 'success' as const });
        }
        details.push({ label: 'ID Payout', value: p._id, mono: true });
        details.push({ label: 'Criado em', value: new Date(p.createdAt).toLocaleString('pt-BR') });
        const subtitle = oi?.storeName || oi?.storeObj?.name ? `Entrega para ${oi.storeObj?.name || oi.storeName}` : `Pedido #${p.orderId?.slice(-6) || '—'}`;
        return (
          <TransactionDetailsModal
            isOpen onClose={() => setSelectedTx(null)}
            title="Detalhes do Repasse" subtitle={subtitle}
            statusLabel={payoutStatusLabel(p.status)} statusTone={p.status}
            amount={p.amount} amountSign="+" details={details}
          />
        );
      })()}

      {selectedTx?.kind === 'history' && (
        <TransactionDetailsModal
          isOpen onClose={() => setSelectedTx(null)}
          title={selectedTx.data.type === 'credit' ? 'Detalhes do Crédito' : 'Detalhes do Débito'}
          subtitle={selectedTx.data.reason}
          statusLabel={selectedTx.data.type === 'credit' ? 'Entrada' : 'Saída'}
          statusTone={selectedTx.data.type}
          amount={selectedTx.data.amount} amountSign={selectedTx.data.type === 'credit' ? '+' : '-'}
          details={[
            { label: 'Data', value: new Date(selectedTx.data.date).toLocaleString('pt-BR') },
            { label: 'Tipo', value: selectedTx.data.type === 'credit' ? 'Crédito' : 'Débito' },
            { label: 'Motivo', value: selectedTx.data.reason },
            ...(selectedTx.data.relatedId ? [{ label: 'Referência', value: selectedTx.data.relatedId, mono: true }] : []),
          ]}
        />
      )}
    </ProtectedRoute>
  );
}
