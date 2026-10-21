/**
 * Lojas (D3b-2a, spec 6 e 7). Permissão store:view_all; 1ª aba ("Todas as lojas") da área Lojas.
 * GET /admin/stores?q=&filter=&cursor= → lista do servidor (primeiro as que precisam de atenção, depois o nome),
 * "Carregar mais" pelo cursor. Busca 300 ms depois da última tecla: nome em parte ou CNPJ completo (com ou sem
 * máscara). Só leitura: a linha abre a ficha (/admin/lojas/[id]), onde ficam Pausar e Liberar.
 */
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import blocks from '../../components/admin/AdminBlocks.module.css';
import { AdminTable, type AdminColumn } from '../../components/admin/AdminTable';
import { StatusTag } from '../../components/admin/StatusTag';
import ui from '../../components/admin/accounts/Accounts.module.css';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { SearchField } from '../../components/ui/SearchField';
import {
  RECEIVING_TAG, SEARCH_DEBOUNCE_MS, STORE_FILTERS, STORE_MODE_LABEL, STORE_SITUATION, accountErrorMessage, fetchStores,
  planLabel, rateLabel, ratingLabel, type StoreFilter, type StoreListItem,
} from '../../lib/adminAccounts';

export default function AdminLojasPage() {
  return (
    <ProtectedRoute required_permission="store:view_all">
      <AdminShell title="Lojas · Todas as lojas" tabs="lojas">
        <LojasScreen />
      </AdminShell>
    </ProtectedRoute>
  );
}

function LojasScreen() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<StoreFilter>('all');
  const [rows, setRows] = useState<StoreListItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const req = useRef(0);
  const moreInFlight = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const n = ++req.current;
    moreInFlight.current = false;
    setRows(null);
    setCursor(null);
    setError(null);
    setMoreError(null);
    setLoadingMore(false);
    try {
      const page = await fetchStores({ q, filter });
      if (n !== req.current) return;
      setRows(page.items);
      setCursor(page.nextCursor);
    } catch (err) {
      if (n !== req.current) return;
      setError(accountErrorMessage(err, 'Não deu para carregar as lojas.'));
    }
  }, [q, filter]);

  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    if (!cursor || moreInFlight.current) return;
    moreInFlight.current = true;
    const n = req.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await fetchStores({ q, filter, cursor });
      if (n !== req.current) return;
      setRows((prev) => {
        const seen = new Set((prev ?? []).map((s) => s.id));
        return [...(prev ?? []), ...page.items.filter((s) => !seen.has(s.id))];
      });
      setCursor(page.nextCursor);
    } catch (err) {
      if (n === req.current) setMoreError(accountErrorMessage(err, 'Não deu para carregar mais lojas.'));
    } finally {
      if (n === req.current) {
        moreInFlight.current = false;
        setLoadingMore(false);
      }
    }
  };

  const columns: AdminColumn<StoreListItem>[] = [
    {
      key: 'loja',
      header: 'Loja',
      primary: true,
      render: (s) => (
        <span className={ui.person}>
          <span className={ui.name}>
            <Link href={`/admin/lojas/${encodeURIComponent(s.id)}`} className={ui.link}>{s.name}</Link>
            {s.attention && <StatusTag tone="warn">Atenção</StatusTag>}
          </span>
          <span className={ui.sub}>{s.ownerName}</span>
        </span>
      ),
    },
    { key: 'plano', header: 'Plano', render: (s) => planLabel(s.plan) },
    { key: 'modo', header: 'Modo', render: (s) => STORE_MODE_LABEL[s.mode] },
    { key: 'nota', header: 'Nota (90 dias)', align: 'right', render: (s) => ratingLabel(s.rating90d) },
    { key: 'cancelamento', header: 'Cancelamento (30 dias)', align: 'right', render: (s) => rateLabel(s.cancelRate30d) },
    {
      key: 'recebimento',
      header: 'Recebimento',
      render: (s) => <StatusTag tone={RECEIVING_TAG[s.receiving].tone}>{RECEIVING_TAG[s.receiving].label}</StatusTag>,
    },
    {
      key: 'situacao',
      header: 'Situação',
      render: (s) => <StatusTag tone={STORE_SITUATION[s.situation].tone}>{STORE_SITUATION[s.situation].label}</StatusTag>,
    },
  ];

  return (
    <div className={ui.stack}>
      <div className={ui.toolbar}>
        <div className={ui.search}>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Nome da loja ou CNPJ"
            inputProps={{ 'aria-label': 'Buscar lojas' }}
          />
        </div>
      </div>
      <div className={ui.filters} role="group" aria-label="Filtrar lojas">
        {STORE_FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} active={filter === f.key} onClick={() => setFilter(f.key)} />
        ))}
      </div>

      <AdminTable
        caption="Lojas"
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        rowLabel={(s) => s.name}
        error={error}
        onRetry={() => { void load(); }}
        empty={q ? 'Nenhuma loja com essa busca' : 'Nenhuma loja com esse filtro'}
      />

      {moreError && <p role="alert" className={blocks.errText}>{moreError}</p>}
      {rows && !error && cursor && (
        <div className={ui.loadMore}>
          <Button variant="secondary" className={ui.touch} loading={loadingMore} onClick={() => { void loadMore(); }}>
            {moreError ? 'Tentar de novo' : 'Carregar mais'}
          </Button>
        </div>
      )}
    </div>
  );
}
