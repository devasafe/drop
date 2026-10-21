/**
 * Ficha da pessoa (D3b-2a, spec 6 e 7). Permissão user:view_all.
 * GET /admin/users/:id → perfil, verificação, pedidos, dívidas, histórico e `can`. Motoboy, lojas e carteira só
 * quando o servidor manda (papel e permissão de dinheiro descontados lá): a tela só mostra o que veio.
 * Ações (no computador, no topo; no celular, numa barra presa ao pé), só as que `can` libera: Bloquear (motivo
 * obrigatório), Desbloquear (motivo opcional), Desconectar e Papéis. "Perdoar" em cada dívida pendente, com o
 * valor na folha. Depois de cada ação a ficha relê sem apagar a tela (padrão D3b-1); releitura que falha deixa a
 * última leitura com aviso. 409 de estado que mudou: a mensagem fica na folha e a ficha relê.
 */
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '../../../components/ProtectedRoute';
import AdminShell from '../../../components/admin/AdminShell';
import { AdminSheet } from '../../../components/admin/AdminSheet';
import blocks from '../../../components/admin/AdminBlocks.module.css';
import { LoadError, LoadSkeleton } from '../../../components/admin/LoadState';
import { StatusTag } from '../../../components/admin/StatusTag';
import ui from '../../../components/admin/accounts/Accounts.module.css';
import { ReasonSheet } from '../../../components/admin/accounts/ReasonSheet';
import { RolesSheet } from '../../../components/admin/accounts/RolesSheet';
import { Timeline } from '../../../components/admin/accounts/Timeline';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { shortId } from '../../../lib/adminMoney';
import { adminOrderStatus } from '../../../lib/adminOps';
import {
  DEBT_TAG, STORE_SITUATION, USER_STATUS, VERIFICATION_ITEM_TAG, VERIFICATION_KIND_LABEL, accountErrorMessage,
  addUserNote, blockNote, blockUser, disconnectUser, fetchUserDetail, fetchUserTimeline, flattenAccountError,
  forgiveDebt, isAccountConflict, lastSeenLabel, phoneLabel, rolesSavedText, rolesText, spDate, unblockUser,
  type TimelineResponse, type UserCan, type UserDebt, type UserDetail,
} from '../../../lib/adminAccounts';
import { formatMoney } from '../../../lib/money';

export default function AdminUserFichaPage() {
  return (
    <ProtectedRoute required_permission="user:view_all">
      <FichaPessoa />
    </ProtectedRoute>
  );
}

type SheetState =
  | { kind: 'block' } | { kind: 'unblock' } | { kind: 'disconnect' } | { kind: 'roles' }
  | { kind: 'forgive'; debt: UserDebt }
  | null;

const hasActions = (can: UserCan, blocked: boolean) =>
  (can.block && !blocked) || (can.unblock && blocked) || can.disconnect || can.roles;

function FichaPessoa() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const { user: me, can: canAuth } = useAuth();
  const { showToast } = useToast();
  const myId = String(me?._id || me?.id || '');
  const isCeo = (me?.activeRole || me?.role) === 'ceo';

  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Releitura silenciosa que falhou: a ficha fica na tela, com aviso.
  const [staleError, setStaleError] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);
  // Só a última leitura vale (ação, "Tentar de novo" e "Carregar mais" podem se cruzar).
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
      const d = await fetchUserDetail(id);
      if (n !== req.current) return;
      hasData.current = true;
      setStaleError(false);
      setDetail(d);
      setTimeline(d.timeline);
    } catch (err) {
      if (n !== req.current) return;
      if (silent) setStaleError(true);
      else { setStaleError(false); setError(accountErrorMessage(err, 'Não deu para carregar a ficha.')); }
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const loadMoreTimeline = async () => {
    if (!id || !timeline?.nextCursor) return;
    const n = req.current;
    const page = await fetchUserTimeline(id, timeline.nextCursor);
    if (n !== req.current) return;
    setTimeline((prev) => {
      if (!prev) return page;
      const seen = new Set(prev.items.map((i) => i.id));
      return { items: [...prev.items, ...page.items.filter((i) => !seen.has(i.id))], nextCursor: page.nextCursor };
    });
  };

  const close = () => setSheet(null);

  /** Ação de uma folha: deu certo, fecha, avisa e relê; 409 de estado, relê e deixa a mensagem na folha. */
  const runAction = async (run: () => Promise<void>, done: string) => {
    try {
      await run();
    } catch (err) {
      if (isAccountConflict(err)) void load(true);
      throw flattenAccountError(err);
    }
    setSheet(null);
    showToast(done, 'success');
    void load(true);
  };

  const writeNote = async (text: string) => {
    if (!id) return;
    await addUserNote(id, text);
    void load(true);
  };

  const p = detail?.profile;
  const blocked = p?.status === 'blocked';
  const withBar = !!detail && hasActions(detail.can, blocked);

  return (
    <AdminShell title={p ? p.name : 'Pessoa'}>
      <div className={withBar ? `${ui.stack} ${ui.withBar}` : ui.stack}>
        <Link href="/admin/users" className={ui.link}>Voltar para Usuários</Link>
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
            <section className={blocks.block} aria-label="Pessoa">
              <div className={blocks.blockHead}>
                <h2 className={blocks.blockTitle}>
                  {p.name}
                  {p.id === myId && <span className={ui.you}>Você</span>}
                </h2>
                <StatusTag tone={USER_STATUS[p.status].tone}>{USER_STATUS[p.status].label}</StatusTag>
              </div>
              {blocked && p.block && <Alert tone="warning" title="Conta bloqueada">{blockNote(p.block)}</Alert>}
              <dl className={ui.facts}>
                <div><dt>E-mail</dt><dd>{p.email}</dd></div>
                <div><dt>Telefone</dt><dd>{phoneLabel(p.phoneLast4)}</dd></div>
                <div><dt>Papéis</dt><dd>{rolesText(p.roles)}</dd></div>
                <div><dt>Conta criada em</dt><dd>{spDate(p.createdAt)}</dd></div>
                <div><dt>Último acesso</dt><dd>{lastSeenLabel(p.lastSeenAt)}</dd></div>
              </dl>
              {p.id === myId && (
                <p className={blocks.muted}>Ninguém bloqueia, desconecta nem muda os papéis da própria conta.</p>
              )}
            </section>

            {withBar && (
              <div role="group" aria-label="Ações da conta" className={ui.actionBar}>
                {detail.can.block && !blocked && (
                  <Button variant="danger" className={ui.touch} onClick={() => setSheet({ kind: 'block' })}>Bloquear</Button>
                )}
                {detail.can.unblock && blocked && (
                  <Button variant="secondary" className={ui.touch} onClick={() => setSheet({ kind: 'unblock' })}>Desbloquear</Button>
                )}
                {detail.can.disconnect && (
                  <Button variant="secondary" className={ui.touch} onClick={() => setSheet({ kind: 'disconnect' })}>Desconectar</Button>
                )}
                {detail.can.roles && (
                  <Button variant="secondary" className={ui.touch} onClick={() => setSheet({ kind: 'roles' })}>Papéis</Button>
                )}
              </div>
            )}

            <div className={ui.split}>
              <div className={ui.side}>
                <section className={blocks.block} aria-label="Dívidas">
                  <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Dívidas</h2></div>
                  {detail.debts.length === 0 ? (
                    <p className={blocks.muted}>Nenhuma dívida.</p>
                  ) : (
                    <ul className={ui.lines}>
                      {detail.debts.map((debt) => (
                        <li key={debt.id} className={ui.line}>
                          <div className={ui.lineMain}>
                            <span className={ui.lineTitle}>{formatMoney(debt.amount)}</span>
                            <span className={ui.sub}>{`${debt.reason} · ${spDate(debt.createdAt)}`}</span>
                          </div>
                          <div className={ui.lineMeta}>
                            <StatusTag tone={DEBT_TAG[debt.status].tone}>{DEBT_TAG[debt.status].label}</StatusTag>
                            {debt.status === 'pending' && detail.can.forgiveDebt && (
                              <Button
                                size="sm"
                                variant="secondary"
                                className={ui.touch}
                                aria-label={`Perdoar ${formatMoney(debt.amount)}`}
                                onClick={() => setSheet({ kind: 'forgive', debt })}
                              >
                                Perdoar
                              </Button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

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
                        const label = `${shortId(o.id)} · ${o.store.name}`;
                        return (
                          <li key={o.id} className={ui.line}>
                            <div className={ui.lineMain}>
                              {canAuth('operation:view')
                                ? <Link href={`/admin/pedidos/${encodeURIComponent(o.id)}`} className={ui.link}>{label}</Link>
                                : <span className={ui.lineTitle}>{label}</span>}
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
                <section className={blocks.block} aria-label="Verificação">
                  <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Verificação</h2></div>
                  {detail.verification.length === 0 ? (
                    <p className={blocks.muted}>Nenhum documento enviado.</p>
                  ) : (
                    <ul className={ui.lines}>
                      {detail.verification.map((v) => (
                        <li key={v.kind} className={ui.line}>
                          <div className={ui.lineMain}>
                            <span className={ui.lineTitle}>{VERIFICATION_KIND_LABEL[v.kind] ?? v.kind}</span>
                            {v.reason && <span className={ui.sub}>{v.reason}</span>}
                          </div>
                          <div className={ui.lineMeta}>
                            {v.at && <span className={ui.sub}>{spDate(v.at)}</span>}
                            <StatusTag tone={VERIFICATION_ITEM_TAG[v.status].tone}>{VERIFICATION_ITEM_TAG[v.status].label}</StatusTag>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {detail.motoboy && (
                  <section className={blocks.block} aria-label="Motoboy">
                    <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Motoboy</h2></div>
                    <dl className={ui.facts}>
                      <div><dt>CNH</dt><dd>{detail.motoboy.cnh ?? '—'}</dd></div>
                      <div><dt>Placa</dt><dd>{detail.motoboy.plate ?? '—'}</dd></div>
                      <div><dt>Chave Pix</dt><dd>{detail.motoboy.hasPixKey ? 'Tem chave' : 'Não tem chave'}</dd></div>
                      <div><dt>Entregas em 30 dias</dt><dd>{detail.motoboy.deliveries30d}</dd></div>
                      {typeof detail.motoboy.earnings30d === 'number' && (
                        <div><dt>Ganhos em 30 dias</dt><dd>{formatMoney(detail.motoboy.earnings30d)}</dd></div>
                      )}
                    </dl>
                  </section>
                )}

                {detail.stores && (
                  <section className={blocks.block} aria-label="Lojas">
                    <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Lojas</h2></div>
                    {detail.stores.length === 0 ? (
                      <p className={blocks.muted}>Nenhuma loja.</p>
                    ) : (
                      <ul className={ui.lines}>
                        {detail.stores.map((s) => (
                          <li key={s.id} className={ui.line}>
                            <div className={ui.lineMain}>
                              {canAuth('store:view_all')
                                ? <Link href={`/admin/lojas/${encodeURIComponent(s.id)}`} className={ui.link}>{s.name}</Link>
                                : <span className={ui.lineTitle}>{s.name}</span>}
                            </div>
                            <StatusTag tone={STORE_SITUATION[s.situation].tone}>{STORE_SITUATION[s.situation].label}</StatusTag>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}

                {/* Cada carteira num cartão, sem somar; carteira null (a pessoa não tem) não aparece. */}
                {([
                  ['Carteira de compras', detail.wallets?.cliente ?? null],
                  ['Carteira de entregas', detail.wallets?.motoboy ?? null],
                ] as const).map(([title, w]) => w && (
                  <section key={title} className={blocks.block} aria-label={title}>
                    <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>{title}</h2></div>
                    <dl className={ui.facts}>
                      <div><dt>Saldo</dt><dd>{formatMoney(w.balance)}</dd></div>
                      <div><dt>Disponível</dt><dd>{formatMoney(w.available)}</dd></div>
                      <div><dt>A liberar</dt><dd>{formatMoney(w.pending)}</dd></div>
                      <div><dt>Bloqueado</dt><dd>{formatMoney(w.blocked)}</dd></div>
                    </dl>
                  </section>
                ))}
              </div>
            </div>

            <ReasonSheet
              open={sheet?.kind === 'block'}
              title="Bloquear conta"
              tone="danger"
              required
              confirmLabel="Bloquear"
              description={(
                <>
                  <p>{`${p.name} (${p.email})`}</p>
                  <p>Se o app estiver aberto, a pessoa sai na hora e não consegue entrar até ser desbloqueada.</p>
                </>
              )}
              onConfirm={(reason) => runAction(() => blockUser(p.id, reason), 'Conta bloqueada.')}
              onClose={close}
            />
            <ReasonSheet
              open={sheet?.kind === 'unblock'}
              title="Desbloquear conta"
              required={false}
              confirmLabel="Desbloquear"
              description={(
                <>
                  <p>{`Depois de desbloquear, ${p.name} pode entrar e usar o app normalmente.`}</p>
                  {p.block?.reason && <p>{`Motivo do bloqueio: ${p.block.reason}`}</p>}
                </>
              )}
              onConfirm={(reason) => runAction(() => unblockUser(p.id, reason), 'Conta desbloqueada.')}
              onClose={close}
            />
            <AdminSheet
              open={sheet?.kind === 'disconnect'}
              title="Desconectar sessão"
              onClose={close}
              primary={{
                label: 'Desconectar',
                onClick: () => runAction(() => disconnectUser(p.id), 'Sessão desconectada (se o app estava aberto).'),
              }}
            >
              <div className={ui.sheetText}>
                <p>{`${p.name} (${p.email})`}</p>
                <p>Se estiver com o app aberto, sai na hora e volta para a tela de entrada. A conta continua ativa.</p>
                <p>Se estiver sem conexão, nada acontece.</p>
              </div>
            </AdminSheet>
            <RolesSheet
              open={sheet?.kind === 'roles'}
              user={{ id: p.id, name: p.name, email: p.email, roles: p.roles }}
              isCeo={isCeo}
              onClose={close}
              onSaved={(storesClosed) => {
                setSheet(null);
                showToast(rolesSavedText(storesClosed), 'success');
                void load(true);
              }}
            />
            {sheet?.kind === 'forgive' && (
              <ReasonSheet
                open
                title="Perdoar dívida"
                required
                confirmLabel={`Perdoar ${formatMoney(sheet.debt.amount)}`}
                description={(
                  <>
                    <p className={ui.amount}>{formatMoney(sheet.debt.amount)}</p>
                    <p>{`A loja abre mão desta multa e nenhum dinheiro se move. A dívida fica como perdoada, com o motivo no histórico, e ${p.name} recebe o aviso "Sua pendência de ${formatMoney(sheet.debt.amount)} foi perdoada."`}</p>
                  </>
                )}
                onConfirm={(reason) => runAction(
                  () => forgiveDebt(p.id, sheet.debt.id, reason),
                  `Dívida de ${formatMoney(sheet.debt.amount)} perdoada.`,
                )}
                onClose={close}
              />
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
