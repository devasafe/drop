/**
 * Usuários (D3b-2a, spec 6 e 7). Permissão user:view_all (a mesma de antes).
 * GET /admin/users?q=&tab=&withDebt=1&cursor= → lista paginada do servidor, 30 por página, "Carregar mais".
 * Busca no servidor 300 ms depois da última tecla: nome ou e-mail em parte, CPF e telefone completos (com ou sem
 * máscara; quem tira a máscara é o servidor). Abas e "Com dívida" também vão na query.
 * A lista é só de leitura: a linha abre a ficha (/admin/users/[id]), onde ficam bloquear, desconectar, papéis e
 * perdoar. Só a última leitura vale (busca, aba e filtro podem se cruzar).
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
import { Tabs, tabPanelProps } from '../../components/ui/Tabs';
import { useAuth } from '../../contexts/AuthContext';
import {
  SEARCH_DEBOUNCE_MS, USER_STATUS, USER_TABS, VERIFICATION_TAG, accountErrorMessage, fetchUsers, lastSeenLabel,
  rolesText, type UserListItem, type UserTab,
} from '../../lib/adminAccounts';
import { formatMoney } from '../../lib/money';

export default function AdminUsersPage() {
  return (
    <ProtectedRoute required_permission="user:view_all">
      <AdminShell title="Usuários">
        <UsuariosScreen />
      </AdminShell>
    </ProtectedRoute>
  );
}

function UsuariosScreen() {
  const { user: me } = useAuth();
  const myId = String(me?._id || me?.id || '');

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<UserTab>('all');
  const [withDebt, setWithDebt] = useState(false);
  const [rows, setRows] = useState<UserListItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Só a última leitura vale: busca, aba e filtro descartam a resposta anterior.
  const req = useRef(0);
  // Trava síncrona contra clique duplo em "Carregar mais".
  const moreInFlight = useRef(false);

  // Busca no servidor só 300 ms depois da última tecla.
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
      const page = await fetchUsers({ q, tab, withDebt });
      if (n !== req.current) return;
      setRows(page.items);
      setCursor(page.nextCursor);
      setNow(Date.now());
    } catch (err) {
      if (n !== req.current) return;
      setError(accountErrorMessage(err, 'Não deu para carregar os usuários.'));
    }
  }, [q, tab, withDebt]);

  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    if (!cursor || moreInFlight.current) return;
    moreInFlight.current = true;
    const n = req.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await fetchUsers({ q, tab, withDebt, cursor });
      if (n !== req.current) return;
      setRows((prev) => {
        const seen = new Set((prev ?? []).map((u) => u.id));
        return [...(prev ?? []), ...page.items.filter((u) => !seen.has(u.id))];
      });
      setCursor(page.nextCursor);
    } catch (err) {
      if (n === req.current) setMoreError(accountErrorMessage(err, 'Não deu para carregar mais pessoas.'));
    } finally {
      if (n === req.current) {
        moreInFlight.current = false;
        setLoadingMore(false);
      }
    }
  };

  const columns: AdminColumn<UserListItem>[] = [
    {
      key: 'pessoa',
      header: 'Pessoa',
      primary: true,
      render: (u) => (
        <span className={ui.person}>
          <span className={ui.name}>
            <Link href={`/admin/users/${encodeURIComponent(u.id)}`} className={ui.link}>{u.name}</Link>
            {u.id === myId && <span className={ui.you}>Você</span>}
          </span>
          <span className={ui.sub}>{u.email}</span>
        </span>
      ),
    },
    { key: 'papel', header: 'Papel', render: (u) => rolesText(u.roles) },
    {
      key: 'conta',
      header: 'Conta',
      render: (u) => (
        <span className={ui.account}>
          <StatusTag tone={USER_STATUS[u.status].tone}>{USER_STATUS[u.status].label}</StatusTag>
          {u.status === 'blocked' && u.blockReason && <span className={ui.reason}>{u.blockReason}</span>}
        </span>
      ),
    },
    {
      key: 'verificacao',
      header: 'Verificação',
      render: (u) => <StatusTag tone={VERIFICATION_TAG[u.verification].tone}>{VERIFICATION_TAG[u.verification].label}</StatusTag>,
    },
    { key: 'acesso', header: 'Último acesso', render: (u) => lastSeenLabel(u.lastSeenAt, now) },
    { key: 'pedidos', header: 'Pedidos em 90 dias', align: 'right', render: (u) => u.orders90d },
    { key: 'divida', header: 'Dívida', align: 'right', render: (u) => (u.pendingDebt === null ? '—' : formatMoney(u.pendingDebt)) },
  ];

  return (
    <div className={ui.stack}>
      <div className={ui.toolbar}>
        <div className={ui.search}>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Nome, e-mail, CPF ou telefone"
            inputProps={{ 'aria-label': 'Buscar pessoas' }}
          />
        </div>
        <Chip label="Com dívida" active={withDebt} onClick={() => setWithDebt((v) => !v)} />
      </div>
      <p className={blocks.muted}>Nome e e-mail podem ser em parte; CPF e telefone, completos.</p>

      <div className={ui.tabs}>
        <Tabs label="Filtrar usuários" items={USER_TABS} value={tab} onChange={(id) => setTab(id as UserTab)} idPrefix="usuarios" />
      </div>

      <div {...tabPanelProps(tab, 'usuarios')}>
        <AdminTable
          caption="Usuários"
          columns={columns}
          rows={rows}
          rowKey={(u) => u.id}
          rowLabel={(u) => u.name}
          error={error}
          onRetry={() => { void load(); }}
          empty={q ? 'Ninguém encontrado com essa busca' : 'Ninguém nesta aba'}
        />
      </div>

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
