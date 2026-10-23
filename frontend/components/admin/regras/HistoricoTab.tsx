/**
 * Regras e taxas · Histórico (D3b-4a). Permissão settings:manage.
 * GET /admin/rules/history?field=&actorId=&from=&to=&cursor= (uma linha por campo mudado; linhas consecutivas
 * com o mesmo batchId viram um grupo só). Datas são dias de São Paulo, inclusivas (o servidor só aceita 2000–2100).
 * "Pessoa" lista quem já apareceu nas páginas lidas. Cursor recusado (400) no "Carregar mais": recarrega do
 * começo com aviso, nunca repete o mesmo cursor. Só a última leitura vale.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../lib/api';
import { adminRoleLabel } from '../../../lib/adminNav';
import { RULE_FIELDS, formatRuleValue, ruleFieldLabel, spShortDateTime } from '../../../lib/ruleFields';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { Skeleton } from '../../ui/Skeleton';
import { serverErrorMessage } from '../dinheiro/serverError';
import blocks from '../AdminBlocks.module.css';
import ui from '../dinheiro/Dinheiro.module.css';
import styles from './Historico.module.css';

export interface RuleChangeItem {
  id: string;
  batchId: string;
  source: 'rules' | 'switches';
  field: string;
  before: unknown;
  after: unknown;
  actorId: string;
  actorName: string | null;
  actorRole: string;
  reason: string | null;
  at: string;
}
interface RuleChangePage { items: RuleChangeItem[]; nextCursor: string | null }

type Group = { batchId: string; actor: string; at: string; reason: string | null; rows: RuleChangeItem[] };

const actorLabelOf = (i: RuleChangeItem) => `${i.actorName ?? 'Alguém'} (${adminRoleLabel(i.actorRole)})`;

function groupByBatch(items: RuleChangeItem[]): Group[] {
  const out: Group[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.batchId === it.batchId) last.rows.push(it);
    else out.push({ batchId: it.batchId, actor: actorLabelOf(it), at: it.at, reason: it.reason, rows: [it] });
  }
  return out;
}

const FIELD_OPTIONS = [
  { value: '', label: 'Todos os campos' },
  ...Object.keys(RULE_FIELDS)
    .map((k) => ({ value: k, label: ruleFieldLabel(k) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const LIST_CHANGED = 'A lista mudou; recarregamos do começo.';

const isPage = (d: unknown): d is RuleChangePage => !!d && Array.isArray((d as RuleChangePage).items);
const httpStatus = (err: unknown): number | undefined => (err as { response?: { status?: number } } | null)?.response?.status;

/** Quem já apareceu fica no filtro "Pessoa" (mesmo depois de filtrar por outra pessoa). */
function mergeActors(prev: Record<string, string>, list: RuleChangeItem[]): Record<string, string> {
  const missing = list.filter((i) => !(i.actorId in prev));
  if (missing.length === 0) return prev;
  const next = { ...prev };
  for (const i of missing) next[i.actorId] = actorLabelOf(i);
  return next;
}

function rangeProblem(from: string, to: string): string | null {
  if ((from && !DAY_RE.test(from)) || (to && !DAY_RE.test(to))) return 'Data inválida.';
  const outside = (d: string) => !!d && (Number(d.slice(0, 4)) < MIN_YEAR || Number(d.slice(0, 4)) > MAX_YEAR);
  if (outside(from) || outside(to)) return `Use datas entre ${MIN_YEAR} e ${MAX_YEAR}.`;
  if (from && to && from > to) return 'A data inicial tem que ser antes da final.';
  return null;
}

export function HistoricoTab() {
  const [actorId, setActorId] = useState('');
  const [field, setField] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<RuleChangeItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actors, setActors] = useState<Record<string, string>>({});
  // Só a última leitura vale; trava síncrona do "Carregar mais".
  const req = useRef(0);
  const moreInFlight = useRef(false);

  const badRange = rangeProblem(from, to);

  const urlFor = useCallback((c?: string) => {
    const p = new URLSearchParams();
    if (field) p.set('field', field);
    if (actorId) p.set('actorId', actorId);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (c) p.set('cursor', c);
    const qs = p.toString();
    return `/admin/rules/history${qs ? `?${qs}` : ''}`;
  }, [field, actorId, from, to]);

  const load = useCallback(async (aviso?: string) => {
    const id = ++req.current;
    moreInFlight.current = false;
    setItems(null);
    setCursor(null);
    setError(null);
    setMoreError(null);
    setNotice(aviso ?? null);
    setLoadingMore(false);
    try {
      const res = await api.get(urlFor());
      if (id !== req.current) return;
      if (!isPage(res.data)) throw new Error('lista fora do formato');
      const data = res.data;
      setItems(data.items);
      setCursor(data.nextCursor ?? null);
      setActors((prev) => mergeActors(prev, data.items));
    } catch (err) {
      if (id === req.current) setError(serverErrorMessage(err, 'Não deu para carregar o histórico.'));
    }
  }, [urlFor]);

  useEffect(() => {
    if (badRange) {
      req.current += 1; // período inválido: descarta qualquer leitura em voo
      return;
    }
    void load();
  }, [load, badRange]);

  const loadMore = async () => {
    if (!cursor || moreInFlight.current) return;
    moreInFlight.current = true;
    const id = req.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await api.get(urlFor(cursor));
      if (id !== req.current) return;
      if (!isPage(res.data)) throw new Error('lista fora do formato');
      const data = res.data;
      setItems((prev) => {
        const seen = new Set((prev ?? []).map((i) => i.id));
        return [...(prev ?? []), ...data.items.filter((i) => !seen.has(i.id))];
      });
      setCursor(data.nextCursor ?? null);
      setActors((prev) => mergeActors(prev, data.items));
    } catch (err) {
      if (id !== req.current) return;
      if (httpStatus(err) === 400) {
        // Cursor recusado: repetir o mesmo cursor falharia de novo. Recomeça a lista.
        void load(LIST_CHANGED);
        return;
      }
      setMoreError(serverErrorMessage(err, 'Não deu para carregar mais mudanças.'));
    } finally {
      if (id === req.current) {
        moreInFlight.current = false;
        setLoadingMore(false);
      }
    }
  };

  const actorOptions = [
    { value: '', label: 'Todas as pessoas' },
    ...Object.entries(actors)
      .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
      .map(([value, label]) => ({ value, label })),
  ];

  const groups = items ? groupByBatch(items) : [];

  return (
    <div className={ui.stack}>
      <p className={blocks.muted}>
        Toda mudança de regra, taxa ou chave da plataforma fica aqui, com quem fez e o motivo. Nada aqui pode ser apagado ou editado.
      </p>
      <div className={ui.toolbar}>
        <Select label="Campo" value={field} onChange={setField} options={FIELD_OPTIONS} />
        <Select label="Pessoa" value={actorId} onChange={setActorId} options={actorOptions} />
        <Input label="De" type="date" value={from} onChange={setFrom} />
        <Input label="Até" type="date" value={to} onChange={setTo} />
      </div>
      <section className={blocks.block} aria-label="Mudanças de regras">
        {badRange ? (
          <p role="alert" className={blocks.errText}>{badRange}</p>
        ) : (
          <>
            {notice && <p role="status" className={blocks.muted}>{notice}</p>}
            {error ? (
              <>
                <p role="alert" className={blocks.errText}>{error}</p>
                <div><Button variant="secondary" onClick={() => { void load(); }}>Tentar de novo</Button></div>
              </>
            ) : !items ? (
              <div aria-busy="true" aria-label="Carregando"><Skeleton height={96} /></div>
            ) : groups.length === 0 ? (
              <p className={blocks.muted}>Nenhuma mudança de regra registrada ainda.</p>
            ) : (
              <div className={styles.groups}>
                {groups.map((g) => (
                  <section key={g.batchId} role="group" aria-label={`${g.actor} · ${spShortDateTime(g.at)}`} className={styles.group}>
                    <div className={styles.head}>
                      <span className={styles.who}>{g.actor}</span>
                      <span className={styles.when}>{spShortDateTime(g.at)}</span>
                    </div>
                    {g.reason && <p className={styles.reason}>{g.reason}</p>}
                    <ul className={styles.rows}>
                      {g.rows.map((r) => (
                        <li key={r.id}>
                          {`${ruleFieldLabel(r.field)}: ${formatRuleValue(r.field, r.before)} → ${formatRuleValue(r.field, r.after)}`}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
            {moreError && <p role="alert" className={blocks.errText}>{moreError}</p>}
            {items && !error && cursor && (
              <div className={ui.loadMore}>
                <Button variant="secondary" className={ui.touch} loading={loadingMore} onClick={() => { void loadMore(); }}>
                  {moreError ? 'Tentar de novo' : 'Carregar mais'}
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default HistoricoTab;
