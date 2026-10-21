/**
 * Ficha da loja (D3b-2a, spec 6 e 7; D3b-2b, spec 9). Permissão store:view_all.
 * GET /admin/stores/:id → resumo (com o dono e a pausa do DROP), números de 30 dias, avaliações, recebimento,
 * plano, pedidos, histórico e `can`.
 * - "Pausar loja" pede motivo e confirmação; "Liberar loja" só aparece com a loja pausada pelo DROP.
 * - D3b-2b: "Estender teste" (7, 14 ou 30 dias, com motivo) e "Cancelar mensalidade" (motivo e o nome da loja
 *   digitado), conforme `can` e o status da mensalidade. O plano cancelado diz até quando a loja vende, e o CEO vê
 *   "Conta Asaas · histórico".
 * - O dono abre a ficha da pessoa. Releitura silenciosa depois de cada ação (padrão D3b-1). No 409 de estado, a
 *   mensagem fica na folha e a ficha relê.
 */
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '../../../components/ProtectedRoute';
import AdminShell from '../../../components/admin/AdminShell';
import blocks from '../../../components/admin/AdminBlocks.module.css';
import { Kpi } from '../../../components/admin/Kpi';
import { LoadError, LoadSkeleton } from '../../../components/admin/LoadState';
import { StatusTag } from '../../../components/admin/StatusTag';
import ui from '../../../components/admin/accounts/Accounts.module.css';
import { AsaasHistory } from '../../../components/admin/accounts/AsaasHistory';
import { ReasonSheet } from '../../../components/admin/accounts/ReasonSheet';
import { CancelSaasSheet, ExtendTrialSheet } from '../../../components/admin/accounts/SaasSheets';
import { Timeline } from '../../../components/admin/accounts/Timeline';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { shortId } from '../../../lib/adminMoney';
import { adminOrderStatus } from '../../../lib/adminOps';
import {
  RECEIVING_TAG, STORE_MODE_LABEL, STORE_SITUATION, accountErrorMessage, addStoreNote, adminPauseNote, cancelSaas,
  extendTrial, fetchStoreDetail, fetchStoreTimeline, flattenAccountError, isAccountConflict, pauseStore, planLabel,
  ratingLabel, saasCoverageEnd, saasPlanText, spDate, unpauseStore, type StoreDetail, type StoreSaas,
  type TimelineResponse, type TrialDays,
} from '../../../lib/adminAccounts';
import { formatMoney } from '../../../lib/money';

type SheetKind = 'pause' | 'unpause' | 'extend' | 'cancelSaas';

export default function AdminLojaFichaPage() {
  return (
    <ProtectedRoute required_permission="store:view_all">
      <FichaLoja />
    </ProtectedRoute>
  );
}

function FichaLoja() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const { can: canAuth } = useAuth();
  const { showToast } = useToast();

  const [detail, setDetail] = useState<StoreDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staleError, setStaleError] = useState(false);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const req = useRef(0);
  const hasData = useRef(false);

  /** `wantSilent`: relê sem apagar a ficha (só vale se já há ficha na tela). */
  const load = useCallback(async (wantSilent = false) => {
    if (!id) return;
    const silent = wantSilent && hasData.current;
    const n = ++req.current;
    if (!silent) { hasData.current = false; setDetail(null); setTimeline(null); }
    setError(null);
    try {
      const d = await fetchStoreDetail(id);
      if (n !== req.current) return;
      hasData.current = true;
      setStaleError(false);
      setDetail(d);
      setTimeline(d.timeline);
    } catch (err) {
      if (n !== req.current) return;
      if (silent) setStaleError(true);
      else { setStaleError(false); setError(accountErrorMessage(err, 'Não deu para carregar a ficha da loja.')); }
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const loadMoreTimeline = async () => {
    if (!id || !timeline?.nextCursor) return;
    const n = req.current;
    const page = await fetchStoreTimeline(id, timeline.nextCursor);
    if (n !== req.current) return;
    setTimeline((prev) => {
      if (!prev) return page;
      const seen = new Set(prev.items.map((i) => i.id));
      return { items: [...prev.items, ...page.items.filter((i) => !seen.has(i.id))], nextCursor: page.nextCursor };
    });
  };

  /** `done` pode ser uma função: o texto do aviso sai da resposta da ação (ex.: a data nova do teste). */
  const runAction = async (run: () => Promise<void>, done: string | (() => string)) => {
    try {
      await run();
    } catch (err) {
      if (isAccountConflict(err)) void load(true);
      throw flattenAccountError(err);
    }
    setSheet(null);
    showToast(typeof done === 'string' ? done : done(), 'success');
    void load(true);
  };

  const writeNote = async (text: string) => {
    if (!id) return;
    await addStoreNote(id, text);
    void load(true);
  };

  const p = detail?.profile;
  const saas = detail?.plan.saas ?? null;
  const paused = !!p?.adminPause;
  const showPause = !!detail && detail.can.pause && !paused;
  const showUnpause = !!detail && detail.can.unpause && paused;
  // A tela confere o estado além do `can` (como na 2a): estender só em teste; cancelar só o que não está cancelado.
  const showExtend = !!detail && detail.can.extendTrial && saas?.status === 'trialing';
  const showCancelSaas = !!detail && detail.can.cancelSaas && !!saas && saas.status !== 'cancelled';
  const withBar = showPause || showUnpause || showExtend || showCancelSaas;

  const extend = (storeId: string, days: TrialDays, reason: string) => {
    let saved: StoreSaas | null = null;
    return runAction(
      async () => { saved = await extendTrial(storeId, days, reason); },
      () => (saved?.trialEndsAt ? `Teste estendido até ${spDate(saved.trialEndsAt)}.` : 'Teste estendido.'),
    );
  };

  return (
    <AdminShell title={p ? p.name : 'Loja'}>
      <div className={withBar ? `${ui.stack} ${ui.withBar}` : ui.stack}>
        <Link href="/admin/lojas" className={ui.link}>Voltar para Lojas</Link>
        {staleError && !error && (
          <p role="status" className={ui.live}>
            Não deu para atualizar. Mostrando a última leitura.{' '}
            <Button variant="secondary" className={ui.touch} onClick={() => { void load(true); }}>Tentar de novo</Button>
          </p>
        )}
        {error ? (
          <LoadError message={error} onRetry={() => { void load(); }} />
        ) : !detail || !timeline || !p ? (
          <LoadSkeleton lines={8} />
        ) : (
          <>
            <section className={blocks.block} aria-label="Loja">
              <div className={blocks.blockHead}>
                <h2 className={blocks.blockTitle}>{p.name}</h2>
                <StatusTag tone={STORE_SITUATION[p.situation].tone}>{STORE_SITUATION[p.situation].label}</StatusTag>
              </div>
              {p.adminPause && <Alert tone="warning" title="Pausada pelo DROP">{adminPauseNote(p.adminPause)}</Alert>}
              <dl className={ui.facts}>
                <div><dt>CNPJ</dt><dd>{p.cnpj ?? '—'}</dd></div>
                <div>
                  <dt>Dono</dt>
                  <dd>
                    {canAuth('user:view_all')
                      ? <Link href={`/admin/users/${encodeURIComponent(p.owner.id)}`} className={ui.link}>{p.owner.name}</Link>
                      : p.owner.name}
                  </dd>
                </div>
                <div><dt>Cidade</dt><dd>{p.city ?? '—'}</dd></div>
              </dl>
            </section>

            {withBar && (
              <div role="group" aria-label="Ações da loja" className={ui.actionBar}>
                {showPause && (
                  <Button variant="danger" className={ui.touch} onClick={() => setSheet('pause')}>Pausar loja</Button>
                )}
                {showUnpause && (
                  <Button variant="secondary" className={ui.touch} onClick={() => setSheet('unpause')}>Liberar loja</Button>
                )}
                {showExtend && (
                  <Button variant="secondary" className={ui.touch} onClick={() => setSheet('extend')}>Estender teste</Button>
                )}
                {showCancelSaas && (
                  <Button variant="danger" className={ui.touch} onClick={() => setSheet('cancelSaas')}>Cancelar mensalidade</Button>
                )}
              </div>
            )}

            <section aria-label="Últimos 30 dias">
              <div className={blocks.kpis}>
                <Kpi label="Pedidos em 30 dias" value={detail.stats30d.orders} />
                <Kpi label="Cancelados por culpa da loja" value={detail.stats30d.cancelledByStore} />
                <Kpi label="Nota" value={ratingLabel(detail.stats30d.rating)} />
              </div>
            </section>

            <div className={ui.split}>
              <div className={ui.side}>
                <section className={blocks.block} aria-label="Histórico">
                  <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Histórico</h2></div>
                  <Timeline
                    items={timeline.items}
                    onLoadMore={timeline.nextCursor ? loadMoreTimeline : undefined}
                    canWrite={detail.can.note}
                    onWriteNote={writeNote}
                  />
                </section>

                <section className={blocks.block} aria-label="Pedidos">
                  <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Pedidos</h2></div>
                  {detail.orders.length === 0 ? (
                    <p className={blocks.muted}>Nenhum pedido.</p>
                  ) : (
                    <ul className={ui.lines}>
                      {detail.orders.map((o) => {
                        const st = adminOrderStatus(o.status, null);
                        return (
                          <li key={o.id} className={ui.line}>
                            <div className={ui.lineMain}>
                              {canAuth('operation:view')
                                ? <Link href={`/admin/pedidos/${encodeURIComponent(o.id)}`} className={ui.link}>{shortId(o.id)}</Link>
                                : <span className={ui.lineTitle}>{shortId(o.id)}</span>}
                              <span className={ui.sub}>{spDate(o.createdAt)}</span>
                            </div>
                            <div className={ui.lineMeta}>
                              <StatusTag tone={st.tone}>{st.label}</StatusTag>
                              <span className={ui.money}>{formatMoney(o.total)}</span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>

              <div className={ui.side}>
                <section className={blocks.block} aria-label="Recebimento">
                  <div className={blocks.blockHead}>
                    <h2 className={blocks.blockTitle}>Recebimento</h2>
                    <StatusTag tone={RECEIVING_TAG[detail.receiving.status].tone}>{RECEIVING_TAG[detail.receiving.status].label}</StatusTag>
                  </div>
                  {detail.receiving.detail && <p className={blocks.muted}>{detail.receiving.detail}</p>}
                </section>

                {detail.asaasHistory && <AsaasHistory history={detail.asaasHistory} />}

                <section className={blocks.block} aria-label="Plano">
                  <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Plano</h2></div>
                  <dl className={ui.facts}>
                    <div><dt>Modo</dt><dd>{STORE_MODE_LABEL[detail.plan.mode]}</dd></div>
                    {detail.plan.plan !== null && <div><dt>Plano</dt><dd>{planLabel(detail.plan.plan)}</dd></div>}
                    {saas && (
                      <>
                        <div><dt>Mensalidade</dt><dd>{saasPlanText(saas)}</dd></div>
                        {saas.cancelledAt && <div><dt>Cancelada em</dt><dd>{spDate(saas.cancelledAt)}</dd></div>}
                        {saas.trialEndsAt && <div><dt>Teste até</dt><dd>{spDate(saas.trialEndsAt)}</dd></div>}
                        {saas.paidUntil && <div><dt>Pago até</dt><dd>{spDate(saas.paidUntil)}</dd></div>}
                      </>
                    )}
                  </dl>
                </section>

                <section className={blocks.block} aria-label="Avaliações">
                  <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Avaliações</h2></div>
                  {detail.reviews.length === 0 ? (
                    <p className={blocks.muted}>Nenhuma avaliação com comentário.</p>
                  ) : (
                    <ul className={ui.lines}>
                      {detail.reviews.map((r) => (
                        <li key={r.orderId} className={ui.line}>
                          <div className={ui.lineMain}>
                            <span className={ui.lineTitle}>{r.comment}</span>
                            <span className={ui.sub}>{`${r.rating} de 5 · ${spDate(r.createdAt)}`}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>

            <ReasonSheet
              open={sheet === 'pause'}
              title="Pausar loja"
              tone="danger"
              required
              confirmLabel="Pausar loja"
              description={(
                <>
                  <p>{p.name}</p>
                  <p>A loja some da vitrine e não recebe pedido novo. Os pedidos em andamento continuam.</p>
                  <p>O lojista vê o motivo e não consegue reabrir: só o DROP libera.</p>
                </>
              )}
              onConfirm={(reason) => runAction(() => pauseStore(p.id, reason), 'Loja pausada pelo DROP.')}
              onClose={() => setSheet(null)}
            />
            <ReasonSheet
              open={sheet === 'unpause'}
              title="Liberar loja"
              required={false}
              confirmLabel="Liberar loja"
              description={(
                <>
                  <p>{p.name}</p>
                  <p>A loja volta a seguir o horário e os controles do lojista.</p>
                  {p.adminPause && <p>{`Motivo da pausa: ${p.adminPause.reason}`}</p>}
                </>
              )}
              onConfirm={(reason) => runAction(() => unpauseStore(p.id, reason), 'Loja liberada.')}
              onClose={() => setSheet(null)}
            />
            {saas && (
              <>
                <ExtendTrialSheet
                  open={sheet === 'extend'}
                  storeName={p.name}
                  trialEndsAt={saas.trialEndsAt}
                  onConfirm={(days, reason) => extend(p.id, days, reason)}
                  onClose={() => setSheet(null)}
                />
                <CancelSaasSheet
                  open={sheet === 'cancelSaas'}
                  storeName={p.name}
                  coverageEnd={saasCoverageEnd(saas)}
                  onConfirm={(reason) => runAction(async () => { await cancelSaas(p.id, reason); }, 'Mensalidade cancelada.')}
                  onClose={() => setSheet(null)}
                />
              </>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
