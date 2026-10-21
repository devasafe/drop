/**
 * Verificações (D3a, telas 2 e 9; D3b-2b, spec 8). Mesma proteção de hoje: verification:view_queue.
 * D3b-2b · P3.2:
 * - "Aprovar tudo" é a rota única do servidor (uma chamada por sujeito, approveAllUrl). O 409
 *   VERIFICATION_CHANGED relê e avisa o que está pendente agora;
 * - a recusa usa os motivos padronizados e "Pedir reenvio";
 * - cada item mostra há quanto tempo espera, e a média de espera fica no topo.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { AdminSheet } from '../../components/admin/AdminSheet';
import { EmptyNote, LoadError, LoadSkeleton } from '../../components/admin/LoadState';
import { Tabs, tabPanelProps } from '../../components/ui/Tabs';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { ADMIN_DESKTOP_MIN, useMinWidth } from '../../hooks/useMinWidth';
import { adminErrorMessage, isHttpStatus } from '../../lib/adminErrors';
import { batchSummaryText, runBatch } from '../../lib/runBatch';
import {
  approveAllUrl,
  avgWaitText,
  buildRejectBody,
  buildVerificationPeople,
  isVerificationAlreadyDecided,
  isVerificationChanged,
  isVerificationStats,
  oldestSubmittedAt,
  PERSON_KIND_LABEL,
  REJECT_MESSAGE_MAX,
  REJECT_REASONS,
  rejectReady,
  VERIFICATION_PERMISSIONS,
  verificationChangedText,
  waitingText,
  type ApproveAllCall,
  type PersonKind,
  type VerificationItem,
  type VerificationPerson,
  type VerificationRejectReason,
  type VerificationStats,
} from '../../lib/adminVerificacoes';
import api from '../../lib/api';
import blocks from '../../components/admin/AdminBlocks.module.css';
import form from '../../components/admin/pessoas/PessoasForm.module.css';
import styles from '../../components/admin/pessoas/Verificacoes.module.css';

type Filter = 'todos' | PersonKind;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'lojista', label: 'Lojas' },
  { id: 'motoboy', label: 'Motoboys' },
  { id: 'cliente', label: 'Clientes' },
];

/** Primeira opção vazia: o item só pode ser recusado depois de escolher o motivo. */
const REASON_OPTIONS = [{ value: '', label: 'Escolha o motivo' }, ...REJECT_REASONS];

const itemsWord = (n: number) => (n === 1 ? '1 item' : `${n} itens`);
const approvedText = (n: number) => (n === 1 ? '1 item aprovado' : `${n} itens aprovados`);
const domId = (key: string) => `verif-${key.replace(/[^a-z0-9]/gi, '-')}`;

/** Verificações (D3a, telas 2 e 9). Mesma proteção de hoje: verification:view_queue. */
export default function AdminVerificacoesPage() {
  return (
    <ProtectedRoute required_permission="verification:view_queue">
      <AdminShell title="Verificações">
        <VerificacoesScreen />
      </AdminShell>
    </ProtectedRoute>
  );
}

function VerificacoesScreen() {
  const { can } = useAuth();
  const { showToast } = useToast();
  const desktop = useMinWidth(ADMIN_DESKTOP_MIN);
  const canClients = can(VERIFICATION_PERMISSIONS.clients);
  const canStores = can(VERIFICATION_PERMISSIONS.stores);
  const canMotoboys = can(VERIFICATION_PERMISSIONS.motoboys);

  const [people, setPeople] = useState<VerificationPerson[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stats, setStats] = useState<VerificationStats | 'error' | null>(null);
  const [filter, setFilter] = useState<Filter>('todos');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [marked, setMarked] = useState<Record<string, VerificationRejectReason | ''>>({});
  const [mensagem, setMensagem] = useState('');
  const [resend, setResend] = useState(true);
  const [rejectErrors, setRejectErrors] = useState<Record<string, string>>({});
  const alive = useRef(true);
  // Leitura nova descarta a resposta atrasada da anterior.
  const loadReq = useRef(0);
  // Contra clique duplo: marcado antes de qualquer setState (um "Aprovar tudo" por vez).
  const approveAllRunning = useRef(false);
  const rejectAbortRef = useRef<AbortController | null>(null);

  // Fechar a tela para a recusa em lote e nada mais mexe no estado (spec D3a 6.2).
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      rejectAbortRef.current?.abort();
    };
  }, []);

  // Só lê a fila que o papel pode ler (cada rota exige a sua permissão).
  const load = useCallback(async () => {
    const n = ++loadReq.current;
    setLoadError(null);
    try {
      const [d, s, m] = await Promise.all([
        canClients ? api.get('/verification/admin/pending') : Promise.resolve(null),
        canStores ? api.get('/verification/admin/store-pending') : Promise.resolve(null),
        canMotoboys ? api.get('/verification/admin/motoboy-pending') : Promise.resolve(null),
      ]);
      if (n !== loadReq.current || !alive.current) return;
      setPeople(buildVerificationPeople({
        docs: d?.data?.items || [],
        stores: s?.data?.stores || [],
        facialOwners: s?.data?.facialPendingOwners || [],
        motoboys: m?.data?.items || [],
      }));
    } catch (err) {
      if (n !== loadReq.current || !alive.current) return;
      setLoadError(isHttpStatus(err, 403) ? adminErrorMessage(err) : 'Não deu para carregar as verificações.');
    }
  }, [canClients, canStores, canMotoboys]);

  useEffect(() => { void load(); }, [load]);

  // Média de espera (spec 8): leitura à parte; falha ou formato errado não esconde a fila.
  useEffect(() => {
    let off = false;
    api.get('/verification/admin/stats')
      .then((r) => { if (!off) setStats(isVerificationStats(r?.data) ? r.data : 'error'); })
      .catch(() => { if (!off) setStats('error'); });
    return () => { off = true; };
  }, []);

  const all = people ?? [];
  const visible = all.filter((p) => filter === 'todos' || p.kind === filter);
  const selected = visible.find((p) => p.id === selectedId) ?? visible[0] ?? null;

  const decidable = (p: VerificationPerson) => p.items.filter((i) => can(i.permission));

  /**
   * Chamadas do "Aprovar tudo" só com os itens que o admin decide (o servidor exige a permissão de cada item e
   * compara só esses com o pendente). Vazio = sem botão: nenhum item decidível ou falta a permissão do sujeito
   * de alguma chamada (o servidor responderia 403).
   */
  const approveCalls = (p: VerificationPerson): ApproveAllCall[] => {
    const permissionOf = new Map(p.items.map((i) => [i.key, i.permission]));
    const calls = approveAllUrl(p).map((c) => {
      const keep = c.keys.map((k, n) => ({ k, kind: c.items[n] })).filter((x) => can(permissionOf.get(x.k) ?? ''));
      return { ...c, keys: keep.map((x) => x.k), items: keep.map((x) => x.kind) };
    }).filter((c) => c.items.length > 0);
    return calls.length > 0 && calls.every((c) => can(c.permission)) ? calls : [];
  };

  const approveOne = async (item: VerificationItem) => {
    setBusyItem(item.key);
    try {
      await api.post(item.approveUrl);
      showToast('Aprovado.', 'success');
    } catch (err) {
      if (isVerificationAlreadyDecided(err)) showToast('Esse item já tinha sido decidido.', 'info');
      else showToast(adminErrorMessage(err), 'error');
    } finally {
      setBusyItem(null);
      await load();
    }
  };

  // "Aprovar tudo" começa no clique: uma chamada por sujeito, em ordem; para na primeira falha.
  const approveAll = async (calls: ApproveAllCall[]) => {
    if (approveAllRunning.current) return;
    approveAllRunning.current = true;
    setApprovingAll(true);
    let approved = 0;
    try {
      for (const call of calls) {
        await api.post(call.url, { items: call.items });
        approved += call.items.length;
      }
      if (alive.current) showToast(`${approvedText(approved)}.`, 'success');
    } catch (err) {
      if (alive.current) {
        const before = approved > 0 ? `${approvedText(approved)}. ` : '';
        const why = isVerificationChanged(err) ? verificationChangedText(err) : adminErrorMessage(err);
        showToast(`${before}${why}`, 'error');
      }
    } finally {
      approveAllRunning.current = false;
      if (alive.current) {
        setApprovingAll(false);
        await load();
      }
    }
  };

  const openReject = (preselect?: string) => {
    setMarked(preselect ? { [preselect]: '' } : {});
    setMensagem('');
    setResend(true);
    setRejectErrors({});
    setRejectOpen(true);
  };

  const markedItems = selected ? decidable(selected).filter((i) => i.key in marked) : [];
  const codes = markedItems.map((i) => marked[i.key]);
  const ready = rejectReady(codes, mensagem);
  const needsMessage = codes.includes('other');

  const sendRejects = async () => {
    if (!selected) return;
    const p = selected;
    const ctrl = new AbortController();
    rejectAbortRef.current = ctrl;
    const r = await runBatch(
      markedItems.map((i) => i.key),
      async (key) => {
        const item = p.items.find((i) => i.key === key);
        const code = marked[key];
        if (item && code) await api.post(item.rejectUrl, buildRejectBody(code, mensagem, resend));
      },
      { isAlreadyDone: isVerificationAlreadyDecided, signal: ctrl.signal },
    );
    if (ctrl.signal.aborted) return;
    const summary = batchSummaryText(r, { one: 'item concluído', many: 'itens concluídos' }); // K6
    if (r.failed.length === 0) {
      setRejectOpen(false);
      showToast(summary, 'success');
    } else {
      // A folha fica aberta só com os que falharam: enviar de novo não repete o que deu certo.
      setRejectErrors(r.errors);
      setMarked((m) => Object.fromEntries(Object.entries(m).filter(([k]) => r.failed.includes(k))));
      showToast(summary, 'error');
    }
    await load();
  };

  const toggleMark = (key: string, on: boolean) =>
    setMarked((m) => {
      const next = { ...m };
      if (on) next[key] = next[key] ?? '';
      else delete next[key];
      return next;
    });

  const countOf = (f: Filter) => all.filter((p) => f === 'todos' || p.kind === f).length;

  const itemCard = (item: VerificationItem) => {
    const titleId = domId(item.key);
    const wait = waitingText(item.submittedAt);
    return (
      <article key={item.key} className={styles.doc} aria-labelledby={titleId}>
        <h3 id={titleId} className={styles.docTitle}>{item.label}</h3>
        {item.detail && <p className={blocks.muted}>{item.detail}</p>}
        {wait && <p className={blocks.muted}>{`Enviado ${wait}`}</p>}
        {item.images.length > 0 && (
          <div className={styles.thumbs}>
            {item.images.map((img) => (
              <a key={`${img.label}-${img.url}`} href={img.url} target="_blank" rel="noreferrer" className={styles.thumb}>
                <img src={img.url} alt={img.label} className={styles.thumbImg} />
                <span className={styles.thumbLabel}>{img.label}</span>
              </a>
            ))}
          </div>
        )}
        {can(item.permission) && (
          <div className={blocks.actions}>
            <Button size="sm" variant="secondary" className={form.touch} aria-describedby={titleId}
              disabled={approvingAll || busyItem !== null} onClick={() => openReject(item.key)}>
              Recusar
            </Button>
            <Button size="sm" className={form.touch} aria-describedby={titleId}
              loading={busyItem === item.key} disabled={approvingAll || busyItem !== null} onClick={() => void approveOne(item)}>
              Aprovar
            </Button>
          </div>
        )}
      </article>
    );
  };

  const listView = visible.length === 0 ? (
    <EmptyNote text="Ninguém aguardando neste filtro." />
  ) : (
    <ul className={styles.people} aria-label="Pessoas aguardando">
      {visible.map((p) => {
        const on = desktop && p.id === selected?.id;
        const wait = waitingText(oldestSubmittedAt(p));
        return (
          <li key={p.id}>
            <button
              type="button"
              className={on ? `${styles.person} ${styles.personOn}` : styles.person}
              aria-current={on ? 'true' : undefined}
              disabled={approvingAll}
              onClick={() => { setSelectedId(p.id); setShowDetail(true); }}
            >
              <span className={styles.personName}>{p.name}</span>
              <span className={styles.personMeta}>
                {[PERSON_KIND_LABEL[p.kind], itemsWord(p.items.length), wait].filter(Boolean).join(' · ')}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const selectedCalls = selected ? approveCalls(selected) : [];
  const detailView = selected && (
    <section className={styles.detail} aria-labelledby="verificacao-pessoa">
      {!desktop && (
        <Button variant="tertiary" className={form.touch} onClick={() => setShowDetail(false)}>Voltar para a lista</Button>
      )}
      <header className={styles.detailHead}>
        <h2 id="verificacao-pessoa" className={blocks.blockTitle}>{selected.name}</h2>
        <p className={blocks.muted}>
          {[PERSON_KIND_LABEL[selected.kind], selected.email, selected.storeNames.join(' · ')].filter(Boolean).join(' · ')}
        </p>
      </header>
      <div className={styles.docs}>{selected.items.map(itemCard)}</div>
      {decidable(selected).length > 0 && (
        <div className={styles.footer}>
          <Button variant="secondary" className={form.touch} disabled={approvingAll} onClick={() => openReject()}>
            Recusar com motivo
          </Button>
          {selectedCalls.length > 0 && (
            <Button className={form.touch} loading={approvingAll} disabled={approvingAll || busyItem !== null}
              onClick={() => void approveAll(selectedCalls)}>
              Aprovar tudo
            </Button>
          )}
        </div>
      )}
    </section>
  );

  const n = markedItems.length;
  const rejectLabel = resend
    ? (n === 0 ? 'Pedir reenvio' : `Pedir reenvio de ${itemsWord(n)}`)
    : (n === 0 ? 'Recusar' : `Recusar ${itemsWord(n)}`);
  const statsText = stats === null
    ? 'Calculando a espera média…'
    : stats === 'error' ? 'Espera média indisponível agora.' : avgWaitText(stats);

  return (
    <div className={styles.page}>
      <p className={blocks.muted}>{statsText}</p>
      {loadError ? (
        <LoadError message={loadError} onRetry={() => { setPeople(null); void load(); }} />
      ) : people === null ? (
        <LoadSkeleton />
      ) : people.length === 0 ? (
        <EmptyNote text="Nada pendente: ninguém aguardando verificação." />
      ) : (
        <>
          <p className={blocks.muted}>{people.length} aguardando</p>
          <div className={styles.tabs}>
            <Tabs
              label="Filtrar por perfil"
              items={FILTERS.map((f) => ({ id: f.id, label: f.label, count: countOf(f.id) }))}
              value={filter}
              onChange={(id) => {
                if (approvingAll) return; // a pessoa aberta não muda no meio do "Aprovar tudo"
                setFilter(id as Filter);
                setShowDetail(false);
              }}
              idPrefix="verificacoes"
            />
          </div>
          <div className={styles.layout} {...tabPanelProps(filter, 'verificacoes')}>
            {(desktop || !showDetail) && listView}
            {(desktop || showDetail) && detailView}
          </div>
        </>
      )}

      <AdminSheet
        open={rejectOpen && selected !== null}
        title={selected ? `Recusar ${selected.name}` : 'Recusar'}
        onClose={() => setRejectOpen(false)}
        primary={{ label: rejectLabel, tone: 'danger', onClick: sendRejects, disabled: !ready }}
      >
        <p className={blocks.muted}>Marque só o que precisa ser recusado. Os itens não marcados continuam aguardando.</p>
        {selected && decidable(selected).map((item) => {
          const on = item.key in marked;
          return (
            <div key={item.key} className={styles.rejectItem}>
              <Checkbox label={item.label} checked={on} onChange={(c) => toggleMark(item.key, c)} />
              {on && (
                <Select
                  label={`Motivo · ${item.label}`}
                  value={marked[item.key]}
                  options={REASON_OPTIONS}
                  onChange={(v) => setMarked((m) => ({ ...m, [item.key]: v as VerificationRejectReason | '' }))}
                />
              )}
              {rejectErrors[item.key] && <p className={blocks.errText}>{rejectErrors[item.key]}</p>}
            </div>
          );
        })}
        <label className={form.field}>
          <span className={form.fieldLabel}>Mensagem para a pessoa</span>
          <textarea
            className={form.textarea}
            rows={3}
            maxLength={REJECT_MESSAGE_MAX}
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
          />
        </label>
        <p className={needsMessage && mensagem.trim() === '' ? blocks.errText : blocks.muted}>
          {`${needsMessage ? 'Obrigatória com “Outro motivo”.' : 'Opcional.'} Até ${REJECT_MESSAGE_MAX} caracteres.`}
        </p>
        <Checkbox label="Pedir reenvio" checked={resend} onChange={setResend} />
        <p className={blocks.muted}>
          {resend ? 'A pessoa vê “Reenvie: motivo” e manda de novo.' : 'A pessoa vê “Recusado: motivo” e ainda pode mandar de novo.'}
        </p>
      </AdminSheet>
    </div>
  );
}
