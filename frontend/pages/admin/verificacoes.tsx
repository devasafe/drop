import { useCallback, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { AdminSheet } from '../../components/admin/AdminSheet';
import { EmptyNote, LoadError, LoadSkeleton } from '../../components/admin/LoadState';
import { Tabs, tabPanelProps } from '../../components/ui/Tabs';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { ADMIN_DESKTOP_MIN, useMinWidth } from '../../hooks/useMinWidth';
import { adminErrorMessage, isHttpStatus } from '../../lib/adminErrors';
import { batchSummaryText, retryFailed, runBatch, type BatchOptions, type BatchResult } from '../../lib/runBatch';
import {
  buildVerificationPeople,
  composeRejectReason,
  isVerificationAlreadyDecided,
  PERSON_KIND_LABEL,
  VERIFICATION_PERMISSIONS,
  type PersonKind,
  type VerificationItem,
  type VerificationPerson,
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

/** O item saiu da fila desde a leitura: erro com a mensagem, nunca "feito". */
const MISSING_ITEM = 'Esse item não está mais na fila. Atualize a lista.';
const missingItemError = () => Object.assign(new Error(MISSING_ITEM), { response: { data: { error: MISSING_ITEM } } });

const itemsWord = (n: number) => (n === 1 ? '1 item' : `${n} itens`);
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
  const [filter, setFilter] = useState<Filter>('todos');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  // O resultado do lote fica preso à pessoa dele: nunca aparece nem é reenviado com outra pessoa aberta.
  const [batch, setBatch] = useState<{ personId: string; result: BatchResult } | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [marked, setMarked] = useState<Record<string, string>>({});
  const [mensagem, setMensagem] = useState('');
  const [rejectErrors, setRejectErrors] = useState<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);
  // Contra clique duplo: marcado antes de qualquer setState (um lote por vez).
  const batchRunning = useRef(false);

  // Fechar a tela no meio do "Aprovar tudo" para o lote (spec 6.2). Abort só na desmontagem.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Só lê a fila que o papel pode ler (cada rota exige a sua permissão).
  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [d, s, m] = await Promise.all([
        canClients ? api.get('/verification/admin/pending') : Promise.resolve(null),
        canStores ? api.get('/verification/admin/store-pending') : Promise.resolve(null),
        canMotoboys ? api.get('/verification/admin/motoboy-pending') : Promise.resolve(null),
      ]);
      setPeople(buildVerificationPeople({
        docs: d?.data?.items || [],
        stores: s?.data?.stores || [],
        facialOwners: s?.data?.facialPendingOwners || [],
        motoboys: m?.data?.items || [],
      }));
    } catch (err) {
      setLoadError(isHttpStatus(err, 403) ? adminErrorMessage(err) : 'Não deu para carregar as verificações.');
    }
  }, [canClients, canStores, canMotoboys]);

  useEffect(() => { void load(); }, [load]);

  const all = people ?? [];
  const visible = all.filter((p) => filter === 'todos' || p.kind === filter);
  const selected = visible.find((p) => p.id === selectedId) ?? visible[0] ?? null;
  const personBatch = batch && selected && batch.personId === selected.id ? batch.result : null;

  const decidable = (p: VerificationPerson) => p.items.filter((i) => can(i.permission));

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

  // Chave que não é da pessoa nunca conta como feita (falha com aviso, sem POST).
  const sendApprove = (p: VerificationPerson) => async (key: string) => {
    const item = p.items.find((i) => i.key === key);
    if (!item) throw missingItemError();
    await api.post(item.approveUrl);
  };

  // O lote começa no clique (nunca num efeito).
  const approveAll = async (p: VerificationPerson, previous?: BatchResult) => {
    if (batchRunning.current) return;
    batchRunning.current = true;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBatchBusy(true);
    try {
      const opts: BatchOptions<string> = {
        isAlreadyDone: isVerificationAlreadyDecided,
        onProgress: (r) => { if (!ctrl.signal.aborted) setBatch({ personId: p.id, result: r }); },
        signal: ctrl.signal,
      };
      const r = previous
        ? await retryFailed(previous, sendApprove(p), opts)
        : await runBatch(decidable(p).map((i) => i.key), sendApprove(p), opts);
      if (ctrl.signal.aborted) return;
      setBatch({ personId: p.id, result: r });
      setBatchBusy(false);
      // K6: "concluídos", nunca "aprovados" (o 400 "não está pendente" conta como feito, mas pode ter sido recusa).
      showToast(batchSummaryText(r, { one: 'concluído', many: 'concluídos' }), r.failed.length > 0 ? 'error' : 'success');
      await load();
    } finally {
      batchRunning.current = false;
    }
  };

  const openReject = (preselect?: string) => {
    setMarked(preselect ? { [preselect]: '' } : {});
    setMensagem('');
    setRejectErrors({});
    setRejectOpen(true);
  };

  const markedItems = selected ? decidable(selected).filter((i) => i.key in marked) : [];
  const rejectReady = markedItems.length > 0 && markedItems.every((i) => marked[i.key].trim() !== '');

  const sendRejects = async () => {
    if (!selected) return;
    const p = selected;
    const r = await runBatch(
      markedItems.map((i) => i.key),
      async (key) => {
        const item = p.items.find((i) => i.key === key);
        if (item) await api.post(item.rejectUrl, { reason: composeRejectReason(marked[key], mensagem) });
      },
      { isAlreadyDone: isVerificationAlreadyDecided },
    );
    const summary = batchSummaryText(r, { one: 'item concluído', many: 'itens concluídos' }); // K6
    if (r.failed.length === 0) {
      setRejectOpen(false);
      showToast(summary, 'success');
    } else {
      // A sheet fica aberta só com os que falharam: enviar de novo não repete o que deu certo.
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
    const state = personBatch?.states[item.key];
    const error = state === 'failed' ? personBatch?.errors[item.key] : undefined;
    return (
      <article key={item.key} className={styles.doc} aria-labelledby={titleId}>
        <h3 id={titleId} className={styles.docTitle}>{item.label}</h3>
        {item.detail && <p className={blocks.muted}>{item.detail}</p>}
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
        {state === 'sending' && <p className={blocks.muted} role="status">Enviando…</p>}
        {error && <p className={blocks.errText}>{error}</p>}
        {can(item.permission) && (
          <div className={blocks.actions}>
            <Button size="sm" variant="secondary" className={form.touch} aria-describedby={titleId}
              disabled={batchBusy || busyItem !== null} onClick={() => openReject(item.key)}>
              Recusar
            </Button>
            <Button size="sm" className={form.touch} aria-describedby={titleId}
              loading={busyItem === item.key} disabled={batchBusy || busyItem !== null} onClick={() => void approveOne(item)}>
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
        return (
          <li key={p.id}>
            <button
              type="button"
              className={on ? `${styles.person} ${styles.personOn}` : styles.person}
              aria-current={on ? 'true' : undefined}
              disabled={batchBusy}
              onClick={() => { setSelectedId(p.id); setShowDetail(true); }}
            >
              <span className={styles.personName}>{p.name}</span>
              <span className={styles.personMeta}>{PERSON_KIND_LABEL[p.kind]} · {itemsWord(p.items.length)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

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
          {personBatch && personBatch.failed.length > 0 && !batchBusy && (
            <Button variant="secondary" className={form.touch} onClick={() => void approveAll(selected, personBatch)}>
              Tentar de novo os que falharam
            </Button>
          )}
          <Button variant="secondary" className={form.touch} disabled={batchBusy} onClick={() => openReject()}>
            Recusar com motivo
          </Button>
          <Button className={form.touch} loading={batchBusy} disabled={batchBusy || busyItem !== null}
            onClick={() => void approveAll(selected)}>
            Aprovar tudo
          </Button>
        </div>
      )}
    </section>
  );

  const n = markedItems.length;

  return (
    <div className={styles.page}>
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
                if (batchBusy) return; // a pessoa aberta não muda no meio do lote
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
        primary={{
          label: n === 0 ? 'Pedir reenvio' : `Pedir reenvio de ${itemsWord(n)}`,
          tone: 'danger',
          onClick: sendRejects,
          disabled: !rejectReady,
        }}
      >
        <p className={blocks.muted}>Marque só o que precisa ser reenviado. Os itens não marcados continuam aguardando.</p>
        {selected && decidable(selected).map((item) => {
          const on = item.key in marked;
          return (
            <div key={item.key} className={styles.rejectItem}>
              <Checkbox label={item.label} checked={on} onChange={(c) => toggleMark(item.key, c)} />
              {on && (
                <Input
                  label={`Motivo · ${item.label}`}
                  value={marked[item.key]}
                  placeholder="Ex.: foto ilegível, documento vencido, selfie não confere"
                  onChange={(v) => setMarked((m) => ({ ...m, [item.key]: v }))}
                />
              )}
              {rejectErrors[item.key] && <p className={blocks.errText}>{rejectErrors[item.key]}</p>}
            </div>
          );
        })}
        <label className={form.field}>
          <span className={form.fieldLabel}>Mensagem para a pessoa (opcional)</span>
          <textarea className={form.textarea} rows={3} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
        </label>
        <p className={blocks.muted}>Cada item recusado leva o texto “motivo. mensagem”.</p>
      </AdminSheet>
    </div>
  );
}
