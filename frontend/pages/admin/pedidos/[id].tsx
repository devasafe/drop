/**
 * Pedido · visão do admin (D3b-1, spec 3.3; protótipo tela 6). Permissão operation:view (padrão só CEO).
 * GET /admin/orders/:id → topo (situação, loja, cliente, total, modo e o aviso de PIN oculto), linha do tempo com
 * as ações do admin, itens, dinheiro do pedido e pessoas. O servidor nunca manda PIN, CPF nem e-mail, e a tela só
 * mostra os campos do contrato. Estorno pendente vira aviso no topo, com link para Estornos.
 * Relê sozinha quando o evento admin:order_changed traz este pedido (ou quando o socket volta).
 * Ações (spec 5): "Reatribuir motoboy" e "Cancelar com estorno", só com allowedActions, cada uma numa AdminSheet.
 */
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '../../../components/ProtectedRoute';
import AdminShell from '../../../components/admin/AdminShell';
import blocks from '../../../components/admin/AdminBlocks.module.css';
import { LoadError, LoadSkeleton } from '../../../components/admin/LoadState';
import { StatusTag } from '../../../components/admin/StatusTag';
import { CancelOrderSheet } from '../../../components/admin/operacao/CancelOrderSheet';
import ui from '../../../components/admin/operacao/Operacao.module.css';
import { ReassignSheet } from '../../../components/admin/operacao/ReassignSheet';
import { TrackSection } from '../../../components/admin/operacao/TrackSection';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { useAdminOrderChanged } from '../../../hooks/useAdminOrderChanged';
import { plural, spTime } from '../../../lib/adminMoney';
import {
  ADMIN_ACTION_LABEL, FAULT_LABEL, PAYOUT_STATUS_LABEL, RECIPIENT_LABEL, SETTLEMENT_LABEL, TIMELINE_LABEL,
  adminOrderStatus, cancelResultText, cancellationNote, fetchAdminOrder, mergeTimeline, minutesLabel, opsErrorMessage,
  orderTag, type AdminOrderActionView, type AdminOrderDetail, type CancelResult, type TimelineStep,
} from '../../../lib/adminOps';
import { formatMoney } from '../../../lib/money';
import { TRANSFER_STATUS_LABEL } from '../../../lib/transferErrors';

export default function AdminPedidoPage() {
  return (
    <ProtectedRoute required_permission="operation:view">
      <PedidoAdmin />
    </ProtectedRoute>
  );
}

function PedidoAdmin() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Releitura silenciosa que falhou: o pedido fica na tela, com aviso.
  const [staleError, setStaleError] = useState(false);
  // Só a última leitura vale (evento chegando junto com "Tentar de novo").
  const req = useRef(0);
  const hasOrder = useRef(false);

  /** `silent`: releitura do evento sem apagar a tela (só vale se já há pedido). */
  const load = useCallback(async (wantSilent = false) => {
    if (!id) return;
    const silent = wantSilent && hasOrder.current;
    const n = ++req.current;
    if (!silent) { hasOrder.current = false; setOrder(null); }
    setError(null);
    try {
      const o = await fetchAdminOrder(id);
      if (n !== req.current) return;
      hasOrder.current = true;
      setStaleError(false);
      setOrder(o);
    } catch (err) {
      if (n !== req.current) return;
      if (silent) setStaleError(true);
      else { setStaleError(false); setError(opsErrorMessage(err, 'Não deu para carregar o pedido.')); }
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useAdminOrderChanged((ids) => {
    if (id && (ids === null || ids.includes(id))) void load(true);
  });

  const [sheet, setSheet] = useState<'cancel' | 'reassign' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning'; title: string; estornos: boolean } | null>(null);

  const onCancelled = (r: CancelResult) => {
    setSheet(null);
    // Valor 0 (pedido não pago): nada a devolver, sem link para Estornos.
    const done = r.refundStatus === 'processed' || r.refundAmount <= 0;
    setNotice({ tone: done ? 'success' : 'warning', title: cancelResultText(r), estornos: !done });
    void load(true);
  };
  const onReassigned = () => {
    setSheet(null);
    setNotice({ tone: 'success', title: 'Corrida devolvida à fila', estornos: false });
    void load(true);
  };
  /** 409 numa folha: o pedido mudou; relê sem apagar a tela (a folha fica aberta com a mensagem). */
  const reloadAfterConflict = () => { void load(true); };

  return (
    <AdminShell title={order ? `Pedido ${orderTag(order.shortId)}` : 'Pedido'}>
      <div className={ui.stack}>
        <Link href="/admin/pedidos" className={ui.link}>Voltar para Pedidos ao vivo</Link>
        {staleError && !error && (
          <p role="status" className={ui.live}>
            Não deu para atualizar. Mostrando a última leitura.{' '}
            <Button variant="secondary" className={ui.touch} onClick={() => { void load(true); }}>Tentar de novo</Button>
          </p>
        )}
        {error ? (
          <LoadError message={error} onRetry={() => { void load(); }} />
        ) : !order ? (
          <LoadSkeleton lines={8} />
        ) : (
          <>
            {notice && (
              <Alert tone={notice.tone} title={notice.title}>
                {notice.estornos && <Link href="/admin/estornos" className={ui.link}>Abrir Estornos</Link>}
              </Alert>
            )}
            <OrderActions order={order} onOpen={setSheet} />
            <PedidoBody order={order} />
            <CancelOrderSheet
              open={sheet === 'cancel'}
              orderId={order.id}
              orderLabel={orderTag(order.shortId)}
              orderVersion={`${order.status}|${order.deliveryStatus ?? ''}|${order.motoboy?.id ?? ''}`}
              onClose={() => setSheet(null)}
              onCancelled={onCancelled}
              onStale={reloadAfterConflict}
            />
            <ReassignSheet
              open={sheet === 'reassign'}
              orderId={order.id}
              motoboyName={order.motoboy?.name ?? 'o motoboy atual'}
              onClose={() => setSheet(null)}
              onReassigned={onReassigned}
              onStale={reloadAfterConflict}
            />
          </>
        )}
      </div>
    </AdminShell>
  );
}

/** Ações do admin (spec 5): só as que o servidor liberou em allowedActions (permissão e regra já descontadas). */
function OrderActions({ order, onOpen }: { order: AdminOrderDetail; onOpen: (s: 'cancel' | 'reassign') => void }) {
  const canReassign = order.allowedActions.includes('reassign');
  const canCancel = order.allowedActions.includes('cancel');
  if (!canReassign && !canCancel) return null;
  return (
    <section className={blocks.block} aria-label="Ações">
      <div className={ui.actions}>
        {canReassign && (
          <Button variant="secondary" className={ui.touch} onClick={() => onOpen('reassign')}>Reatribuir motoboy</Button>
        )}
        {canCancel && (
          <Button variant="danger" className={ui.touch} onClick={() => onOpen('cancel')}>Cancelar com estorno</Button>
        )}
      </div>
    </section>
  );
}

const share = (v: number | null) => (v === null ? '—' : formatMoney(v));

function PedidoBody({ order }: { order: AdminOrderDetail }) {
  const st = adminOrderStatus(order.status, order.deliveryStatus);
  const m = order.money;
  const total = m.subtotal + m.deliveryFee - m.couponDiscount;
  return (
    <>
      {order.refundPending && (
        <Alert tone="warning" title="Estorno pendente">
          O dinheiro do cliente ainda não voltou. <Link href="/admin/estornos" className={ui.link}>Ver em Estornos</Link>
        </Alert>
      )}

      <section className={blocks.block} aria-label="Resumo do pedido">
        <div className={blocks.blockHead}>
          <h2 className={blocks.blockTitle}>{orderTag(order.shortId)}</h2>
          <StatusTag tone={st.tone}>{st.label}</StatusTag>
        </div>
        <dl className={ui.facts}>
          <div><dt>Loja</dt><dd>{order.store.name}</dd></div>
          <div><dt>Cliente</dt><dd>{order.customer.name}</dd></div>
          <div><dt>Total</dt><dd>{formatMoney(total)}</dd></div>
          <div><dt>Modo</dt><dd>{SETTLEMENT_LABEL[order.settlementMode] ?? order.settlementMode}</dd></div>
        </dl>
        <Alert tone="info">PIN de retirada e de entrega ocultos</Alert>
      </section>

      <div className={ui.split}>
        <div className={ui.side}>
          <section className={blocks.block} aria-label="Linha do tempo">
            <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Linha do tempo</h2></div>
            <ol className={ui.timeline}>
              {mergeTimeline(order.timeline, order.adminActions).map((e) => (e.kind === 'step'
                ? <StepLine key={e.key} step={e.step} order={order} />
                : <ActionLine key={e.key} action={e.action} />))}
            </ol>
          </section>

          <section className={blocks.block} aria-label="Itens">
            <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Itens</h2></div>
            <ul className={ui.lines}>
              {order.items.map((it, i) => (
                <li key={`${it.name}-${i}`} className={ui.line}>
                  <span>{`${it.quantity}× ${it.name}`}</span>
                  <span className={ui.money}>{formatMoney(it.total)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className={ui.side}>
          <section className={blocks.block} aria-label="Dinheiro do pedido">
            <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Dinheiro do pedido</h2></div>
            <dl className={ui.facts}>
              <div><dt>Subtotal</dt><dd>{formatMoney(m.subtotal)}</dd></div>
              <div><dt>Entrega</dt><dd>{formatMoney(m.deliveryFee)}</dd></div>
              {m.couponDiscount > 0 && <div><dt>Cupom</dt><dd>{formatMoney(-m.couponDiscount)}</dd></div>}
              {m.walletApplied > 0 && <div><dt>Carteira</dt><dd>{formatMoney(-m.walletApplied)}</dd></div>}
              <div><dt>Pago pelo cliente</dt><dd>{formatMoney(m.paidByCustomer)}</dd></div>
            </dl>
            <h3 className={ui.subTitle}>Partes</h3>
            <dl className={ui.facts}>
              <div><dt>Loja</dt><dd>{share(m.storeShare)}</dd></div>
              <div><dt>Motoboy</dt><dd>{share(m.motoboyShare)}</dd></div>
              <div><dt>DROP</dt><dd>{share(m.platformShare)}</dd></div>
            </dl>
            {order.settlementMode === 'custody' ? (
              m.payouts.length === 0 ? (
                <p className={blocks.muted}>Nenhum repasse para mostrar.</p>
              ) : (
                <ul className={ui.lines} aria-label="Repasses">
                  {m.payouts.map((p) => (
                    <li key={p.id} className={ui.line}>
                      <span>{`Repasse · ${RECIPIENT_LABEL[p.recipientType] ?? p.recipientType}`}</span>
                      <span className={ui.money}>{`${formatMoney(p.amount)} · ${PAYOUT_STATUS_LABEL[p.status] ?? p.status}`}</span>
                    </li>
                  ))}
                </ul>
              )
            ) : m.motoboyTransfer ? (
              <dl className={ui.facts}>
                <div>
                  <dt>Pix ao motoboy</dt>
                  <dd>{`${formatMoney(m.motoboyTransfer.amount)} · ${TRANSFER_STATUS_LABEL[m.motoboyTransfer.status] ?? m.motoboyTransfer.status}`}</dd>
                </div>
              </dl>
            ) : (
              <p className={blocks.muted}>Nenhum Pix ao motoboy para mostrar.</p>
            )}
          </section>

          <section className={blocks.block} aria-label="Pessoas">
            <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Pessoas</h2></div>
            <dl className={ui.facts}>
              <div><dt>Cliente</dt><dd>{order.customer.name}</dd></div>
              <div><dt>Pedidos do cliente</dt><dd>{plural(order.customer.ordersCount, 'pedido', 'pedidos')}</dd></div>
              <div><dt>Cancelamentos em 30 dias</dt><dd>{order.customer.cancellations30d}</dd></div>
              {order.motoboy ? (
                <>
                  <div><dt>Motoboy</dt><dd>{order.motoboy.name}</dd></div>
                  <div><dt>Veículo</dt><dd>{[order.motoboy.vehicle, order.motoboy.plate].filter(Boolean).join(' · ') || '—'}</dd></div>
                  <div>
                    <dt>Nota</dt>
                    <dd>
                      {order.motoboy.rating === null
                        ? 'Sem nota'
                        : order.motoboy.rating.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </dd>
                  </div>
                </>
              ) : (
                <div><dt>Motoboy</dt><dd>Ainda sem motoboy</dd></div>
              )}
            </dl>
          </section>

          <TrackSection orderId={order.id} />
        </div>
      </div>
    </>
  );
}

function StepLine({ step, order }: { step: TimelineStep; order: AdminOrderDetail }) {
  const cancelled = step.key === 'cancelled';
  const cls = !step.at ? ui.step : `${ui.step} ${cancelled ? ui.stepCancelled : ui.stepDone}`;
  return (
    <li className={cls} data-step={step.key}>
      <span className={ui.stepLabel}>{TIMELINE_LABEL[step.key] ?? step.key}</span>
      <span className={ui.stepTime}>{step.at ? spTime(step.at) : '—'}</span>
      {step.at && step.sincePrevMin !== null && (
        <span className={ui.stepNote}>{`+${minutesLabel(step.sincePrevMin)} desde a etapa anterior`}</span>
      )}
      {cancelled && order.cancellation && <span className={ui.stepNote}>{cancellationNote(order.cancellation)}</span>}
    </li>
  );
}

function ActionLine({ action }: { action: AdminOrderActionView }) {
  const note = [
    `por ${action.actorName}`,
    action.reason,
    action.faultParty ? `culpa: ${FAULT_LABEL[action.faultParty]}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <li className={`${ui.step} ${ui.stepAction}`} data-step={`acao-${action.action}`}>
      <span className={ui.stepLabel}>{ADMIN_ACTION_LABEL[action.action] ?? action.action}</span>
      <span className={ui.stepTime}>{spTime(action.at)}</span>
      <span className={ui.stepNote}>{note}</span>
    </li>
  );
}
