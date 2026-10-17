/**
 * Dinheiro · Histórico (D3b-3, spec 8). Permissão money:overview (padrão só CEO).
 * GET /admin/money/actions?actorId=&type=&from=&to=&cursor= (50 por página, "Carregar mais").
 * Uma linha por ação de dinheiro do admin: quando, quem (nome e papel), ação, alvo, valor, motivo e
 * antes → depois. Datas são dias de São Paulo, inclusivas (o servidor só aceita 2000–2100).
 * "Pessoa" lista quem já apareceu nas páginas lidas. Cursor recusado (400) no "Carregar mais":
 * recarrega do começo com aviso, nunca repete o mesmo cursor.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '../../../components/ProtectedRoute';
import AdminShell from '../../../components/admin/AdminShell';
import { AdminTable, type AdminColumn } from '../../../components/admin/AdminTable';
import blocks from '../../../components/admin/AdminBlocks.module.css';
import ui from '../../../components/admin/dinheiro/Dinheiro.module.css';
import { serverErrorMessage } from '../../../components/admin/dinheiro/serverError';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import api from '../../../lib/api';
import { adminRoleLabel } from '../../../lib/adminNav';
import {
  ACTION_TYPE_LABEL, ADMIN_MONEY_ACTION_TYPES, actionTargetLabel, actorLabel, spDateTime, summarizeMoneyChange,
  type AdminMoneyActionItem, type AdminMoneyActionPage,
} from '../../../lib/adminMoney';
import { formatMoney } from '../../../lib/money';

const TYPE_OPTIONS = [
  { value: '', label: 'Todas as ações' },
  ...ADMIN_MONEY_ACTION_TYPES.map((t) => ({ value: t, label: ACTION_TYPE_LABEL[t] })),
];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const LIST_CHANGED = 'A lista mudou; recarregamos do começo.';

const isPage = (d: unknown): d is AdminMoneyActionPage => !!d && Array.isArray((d as AdminMoneyActionPage).items);
const httpStatus = (err: unknown): number | undefined => (err as { response?: { status?: number } } | null)?.response?.status;

/** Quem já apareceu fica no filtro "Pessoa" (mesmo depois de filtrar por outra pessoa). */
function mergeActors(prev: Record<string, string>, list: AdminMoneyActionItem[]): Record<string, string> {
  const missing = list.filter((i) => !(i.actorId in prev));
  if (missing.length === 0) return prev;
  const next = { ...prev };
  for (const i of missing) next[i.actorId] = actorLabel(i);
  return next;
}

function rangeProblem(from: string, to: string): string | null {
  if ((from && !DAY_RE.test(from)) || (to && !DAY_RE.test(to))) return 'Data inválida.';
  const outside = (d: string) => !!d && (Number(d.slice(0, 4)) < MIN_YEAR || Number(d.slice(0, 4)) > MAX_YEAR);
  if (outside(from) || outside(to)) return `Use datas entre ${MIN_YEAR} e ${MAX_YEAR}.`;
  if (from && to && from > to) return 'A data inicial tem que ser antes da final.';
  return null;
}

export default function AdminDinheiroHistoricoPage() {
  return (
    <ProtectedRoute required_permission="money:overview">
      <AdminShell title="Dinheiro · Histórico" tabs="dinheiro">
        <Historico />
      </AdminShell>
    </ProtectedRoute>
  );
}

function Historico() {
  const [actorId, setActorId] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<AdminMoneyActionItem[] | null>(null);
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
    if (actorId) p.set('actorId', actorId);
    if (type) p.set('type', type);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (c) p.set('cursor', c);
    const qs = p.toString();
    return `/admin/money/actions${qs ? `?${qs}` : ''}`;
  }, [actorId, type, from, to]);

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
      setMoreError(serverErrorMessage(err, 'Não deu para carregar mais ações.'));
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

  const columns: AdminColumn<AdminMoneyActionItem>[] = [
    { key: 'quando', header: 'Quando', render: (i) => spDateTime(i.at) },
    {
      key: 'quem', header: 'Quem',
      render: (i) => (
        <span>
          {i.actorName ?? 'Pessoa removida'}
          <span className={ui.sub}>{adminRoleLabel(i.actorRole)}</span>
        </span>
      ),
    },
    { key: 'acao', header: 'Ação', primary: true, render: (i) => ACTION_TYPE_LABEL[i.type] ?? i.type },
    { key: 'alvo', header: 'Alvo', render: (i) => actionTargetLabel(i.targetType, i.targetId) },
    { key: 'valor', header: 'Valor', align: 'right', render: (i) => (i.amount === null ? '—' : formatMoney(i.amount)) },
    { key: 'motivo', header: 'Motivo', render: (i) => i.reason || '—' },
    { key: 'mudanca', header: 'Antes → depois', render: (i) => summarizeMoneyChange(i.before, i.after) },
  ];

  return (
    <div className={ui.stack}>
      <p className={blocks.muted}>
        Toda ação de dinheiro feita no painel fica aqui, com quem fez e o motivo. Nada aqui pode ser apagado ou editado.
      </p>
      <div className={ui.toolbar}>
        <Select label="Ação" value={type} onChange={setType} options={TYPE_OPTIONS} />
        <Select label="Pessoa" value={actorId} onChange={setActorId} options={actorOptions} />
        <Input label="De" type="date" value={from} onChange={setFrom} />
        <Input label="Até" type="date" value={to} onChange={setTo} />
      </div>
      <section className={blocks.block} aria-label="Ações de dinheiro">
        {badRange ? (
          <p role="alert" className={blocks.errText}>{badRange}</p>
        ) : (
          <>
            {notice && <p role="status" className={blocks.muted}>{notice}</p>}
            <AdminTable
              columns={columns}
              rows={items}
              rowKey={(i) => i.id}
              rowLabel={(i) => ACTION_TYPE_LABEL[i.type] ?? i.type}
              error={error}
              onRetry={() => { void load(); }}
              empty="Nenhuma ação registrada"
              caption="Ações de dinheiro"
            />
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
