import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AdminShell from '../../components/admin/AdminShell';
import { AdminTable, type AdminColumn } from '../../components/admin/AdminTable';
import { AdminSheet } from '../../components/admin/AdminSheet';
import { StatusTag } from '../../components/admin/StatusTag';
import { EmptyNote, LoadError, LoadSkeleton } from '../../components/admin/LoadState';
import { Tabs, tabPanelProps } from '../../components/ui/Tabs';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { adminErrorMessage, isHttpStatus } from '../../lib/adminErrors';
import { REASON_MAX, REASON_MIN, reasonIsValid } from '../../lib/adminAccounts';
import api from '../../lib/api';
import blocks from '../../components/admin/AdminBlocks.module.css';
import form from '../../components/admin/pessoas/PessoasForm.module.css';
import styles from '../../components/admin/pessoas/Planos.module.css';

interface PlanSub {
  _id: string;
  storeName: string;
  currentPlan: string;
  requestedPlan?: string | null;
  planChangeStatus?: string;
  requestedAt?: string;
  rejectionReason?: string | null;
  /** Motivo que a loja escreveu ao pedir a troca (D3b-2b; opcional). */
  requestReason?: string | null;
  commissionRate?: number | null;
}

const PLANS: Record<string, { short: string; name: string }> = {
  plan1: { short: 'Plano 1', name: 'Vitrine, sem motoboy' },
  plan2: { short: 'Plano 2', name: 'Vitrine com motoboys do DROP' },
  plan3: { short: 'Plano 3', name: 'Premium' },
};
const planShort = (id?: string | null) => (id && PLANS[id] ? PLANS[id].short : 'Plano desconhecido');
const planText = (id?: string | null) => (id && PLANS[id] ? `${PLANS[id].short} · ${PLANS[id].name}` : 'Plano desconhecido');
const dateBR = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

type PlanTab = 'pendentes' | 'todas';
const TITLE = 'Lojas · Planos';

/**
 * Lojas → Planos (D3a, tela 14). A guarda é a de hoje: can('plan:view') e /access-denied (sem ProtectedRoute).
 * Aprovar e recusar exigem plan:approve no servidor: os botões só aparecem com ela.
 */
export default function PlanApprovals() {
  const router = useRouter();
  const { user, loading: authLoading, can, permissionsLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !permissionsLoading && user && !can('plan:view')) {
      router.push('/access-denied');
    }
  }, [user, authLoading, permissionsLoading, can, router]);

  if (authLoading || permissionsLoading) {
    return (
      <AdminShell title={TITLE} tabs="lojas">
        <LoadSkeleton />
      </AdminShell>
    );
  }
  if (!can('plan:view')) return null;

  return (
    <AdminShell title={TITLE} tabs="lojas">
      <PlanosScreen canApprove={can('plan:approve')} />
    </AdminShell>
  );
}

function PlanosScreen({ canApprove }: { canApprove: boolean }) {
  const { showToast } = useToast();
  const [pending, setPending] = useState<PlanSub[] | null>(null);
  const [all, setAll] = useState<PlanSub[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<PlanTab>('pendentes');
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PlanSub | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, a] = await Promise.all([
        api.get('/settings/pending-plan-changes'),
        api.get('/settings/all-store-subscriptions'),
      ]);
      setPending(Array.isArray(p.data) ? p.data : []);
      setAll(Array.isArray(a.data) ? a.data : []);
    } catch (err) {
      setError(isHttpStatus(err, 403) ? adminErrorMessage(err) : 'Não deu para carregar os pedidos de plano.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** O pedido sai dos pendentes; em "Todas", a assinatura vira a que o servidor devolveu. */
  const applyDecision = (id: string, sub?: PlanSub) => {
    setPending((list) => list && list.filter((p) => p._id !== id));
    if (sub) setAll((list) => list && list.map((s) => (s._id === id ? sub : s)));
  };

  const approve = async (sub: PlanSub) => {
    setApproving(sub._id);
    try {
      const res = await api.post('/settings/approve-plan-change', { subscriptionId: sub._id });
      applyDecision(sub._id, res.data?.subscription);
      showToast(`${planShort(sub.requestedPlan)} aprovado para ${sub.storeName}.`, 'success');
    } catch (err) {
      showToast(adminErrorMessage(err, 'Não deu para aprovar.'), 'error');
      if (isHttpStatus(err, 409)) await load();
    } finally {
      setApproving(null);
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    try {
      const res = await api.post('/settings/reject-plan-change', { subscriptionId: rejecting._id, reason: reason.trim() });
      applyDecision(rejecting._id, res.data?.subscription);
      showToast('Pedido recusado.', 'success');
      setRejecting(null);
      setReason('');
    } catch (err) {
      // 409: a loja desistiu ou outra pessoa decidiu. Relê e mostra o texto do servidor na sheet.
      if (isHttpStatus(err, 409)) void load();
      throw err;
    }
  };

  const columns: AdminColumn<PlanSub>[] = [
    { key: 'loja', header: 'Loja', primary: true, render: (s) => s.storeName },
    { key: 'plano', header: 'Plano', render: (s) => planText(s.currentPlan) },
    {
      key: 'situacao',
      header: 'Situação',
      render: (s) => {
        if (s.planChangeStatus === 'pending') return <StatusTag tone="warn">Pede {planShort(s.requestedPlan)}</StatusTag>;
        if (s.planChangeStatus === 'rejected') {
          return (
            <span className={styles.situacao}>
              <StatusTag tone="bad">Recusado</StatusTag>
              {s.rejectionReason && <span className={blocks.muted}>{s.rejectionReason}</span>}
            </span>
          );
        }
        return <StatusTag tone="neutral">Sem pedido</StatusTag>;
      },
    },
    { key: 'comissao', header: 'Comissão', align: 'right', render: (s) => (s.commissionRate == null ? '—' : `${s.commissionRate}%`) },
  ];

  const card = (sub: PlanSub) => {
    const titleId = `plano-${sub._id}`;
    return (
      <li key={sub._id}>
        <article className={styles.card} aria-labelledby={titleId}>
          <header className={blocks.blockHead}>
            <h3 id={titleId} className={blocks.blockTitle}>{sub.storeName}</h3>
            <span className={blocks.muted}>pedido em {dateBR(sub.requestedAt)}</span>
          </header>
          <dl className={styles.compare}>
            <div className={styles.compareItem}>
              <dt>Hoje</dt>
              <dd>{planText(sub.currentPlan)}</dd>
            </div>
            <div className={`${styles.compareItem} ${styles.want}`}>
              <dt>Quer</dt>
              <dd>{planText(sub.requestedPlan)}</dd>
            </div>
          </dl>
          {sub.requestReason && <p className={blocks.muted}>{`Motivo da loja: ${sub.requestReason}`}</p>}
          {canApprove && (
            <div className={styles.cardActions}>
              <Button variant="secondary" className={form.touch} disabled={approving === sub._id}
                onClick={() => { setReason(''); setRejecting(sub); }}>
                Recusar com motivo
              </Button>
              <Button className={form.touch} loading={approving === sub._id} disabled={approving !== null}
                onClick={() => void approve(sub)}>
                Aprovar {planShort(sub.requestedPlan)}
              </Button>
            </div>
          )}
        </article>
      </li>
    );
  };

  return (
    <div className={styles.page}>
      {error ? (
        <LoadError message={error} onRetry={() => { setPending(null); setAll(null); void load(); }} />
      ) : pending === null || all === null ? (
        <LoadSkeleton />
      ) : (
        <>
          <div className={styles.tabs}>
            <Tabs
              label="Pedidos de plano"
              items={[
                { id: 'pendentes', label: 'Pendentes', count: pending.length },
                { id: 'todas', label: 'Todas', count: all.length },
              ]}
              value={tab}
              onChange={(id) => setTab(id as PlanTab)}
              idPrefix="planos"
            />
          </div>
          <div {...tabPanelProps(tab, 'planos')}>
            {tab === 'pendentes' ? (
              pending.length === 0
                ? <EmptyNote text="Nenhum pedido de troca aguardando" />
                : <ul className={styles.cards} aria-label="Pedidos de troca">{pending.map(card)}</ul>
            ) : (
              <AdminTable
                caption="Assinaturas"
                columns={columns}
                rows={all}
                rowKey={(s) => s._id}
                rowLabel={(s) => s.storeName}
                empty="Nenhum plano registrado"
              />
            )}
          </div>
        </>
      )}

      <AdminSheet
        open={rejecting !== null}
        title="Recusar troca de plano"
        onClose={() => setRejecting(null)}
        primary={{ label: 'Recusar', tone: 'danger', onClick: reject, disabled: !reasonIsValid(reason) }}
      >
        {rejecting && (
          <p className={form.lead}>
            {rejecting.storeName}: {planShort(rejecting.currentPlan)} → {planShort(rejecting.requestedPlan)}
          </p>
        )}
        <label className={form.field}>
          <span className={form.fieldLabel}>Motivo (obrigatório)</span>
          <textarea
            className={form.textarea}
            rows={3}
            maxLength={REASON_MAX}
            value={reason}
            placeholder="Ex.: Plano não corresponde ao perfil da loja"
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <p className={blocks.muted}>{`De ${REASON_MIN} a ${REASON_MAX} caracteres. A loja continua no plano atual e vê o motivo no aviso e na tela do plano.`}</p>
      </AdminSheet>
    </div>
  );
}
