import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { AdminTable, type AdminColumn } from '../../components/admin/AdminTable';
import { AdminSheet, type AdminSheetPrimary } from '../../components/admin/AdminSheet';
import { StatusTag } from '../../components/admin/StatusTag';
import { Tabs, tabPanelProps } from '../../components/ui/Tabs';
import { SearchField } from '../../components/ui/SearchField';
import { Checkbox } from '../../components/ui/Checkbox';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { adminErrorMessage, isConflictWithCode, isHttpStatus } from '../../lib/adminErrors';
import api from '../../lib/api';
import blocks from '../../components/admin/AdminBlocks.module.css';
import form from '../../components/admin/pessoas/PessoasForm.module.css';
import styles from '../../components/admin/pessoas/Usuarios.module.css';

interface AdminUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  roles?: string[];
  activeRole?: string;
  status: 'active' | 'inactive' | 'blocked';
  blockedAt?: string;
  blockReason?: string;
  createdAt: string;
}

/** Papéis que PUT /admin/users/:id/roles aceita (ALLOWED_ROLES do servidor), com o rótulo da tela. */
const ROLE_OPTIONS = [
  { value: 'ceo', label: 'CEO' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'gerente_geral', label: 'Gerente geral' },
  { value: 'gerente_clientes', label: 'Gerente de clientes' },
  { value: 'gerente_lojistas', label: 'Gerente de lojistas' },
  { value: 'gerente_motoboys', label: 'Gerente de motoboys' },
  { value: 'lojista', label: 'Lojista' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'motoboy', label: 'Motoboy' },
];

/** Papéis da equipe (ADMIN_ROLES do servidor): só o CEO atribui e só o CEO mexe em quem tem um deles. */
const STAFF_ROLES = ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'];

type UserTab = 'todos' | 'clientes' | 'lojistas' | 'motoboys' | 'equipe' | 'bloqueados';
const TABS: { id: UserTab; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'lojistas', label: 'Lojistas' },
  { id: 'motoboys', label: 'Motoboys' },
  { id: 'equipe', label: 'Equipe' },
  { id: 'bloqueados', label: 'Bloqueados' },
];

type ActionState =
  | { type: 'none' }
  | { type: 'edit-roles'; user: AdminUser; roles: string[]; error?: string }
  | { type: 'block'; user: AdminUser; reason: string }
  | { type: 'unblock'; user: AdminUser }
  | { type: 'disconnect'; user: AdminUser };

/**
 * Todos os papéis da pessoa, na ordem de ROLE_OPTIONS: `roles` mais `role` e `activeRole` se faltarem
 * (conta antiga) e sempre `cliente`. É o que a folha "Papéis" marca ao abrir.
 */
const ROLE_ORDER = ROLE_OPTIONS.map((r) => r.value);
const sortRoles = (roles: string[]) =>
  [...roles].sort((a, b) => (ROLE_ORDER.indexOf(a) + 1 || 99) - (ROLE_ORDER.indexOf(b) + 1 || 99));
const rolesOf = (u: AdminUser) =>
  sortRoles(Array.from(new Set([...(u.roles ?? []), u.role, u.activeRole, 'cliente'].filter(Boolean) as string[])));
/** Papéis além de cliente: o que a coluna mostra e o que tira a pessoa da aba "Clientes". */
const extraRolesOf = (u: AdminUser) => rolesOf(u).filter((r) => r !== 'cliente');
const roleLabel = (role?: string) => (role ? ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role : '—');
const rolesText = (u: AdminUser) => (extraRolesOf(u).length ? extraRolesOf(u) : ['cliente']).map(roleLabel).join(' · ');
const isStaff = (u: AdminUser) => [...(u.roles ?? []), u.role, u.activeRole].some((r) => !!r && STAFF_ROLES.includes(r));
const sameRoles = (a: string[], b: string[]) => a.length === b.length && a.every((r) => b.includes(r));
const createdAtText = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

function inTab(u: AdminUser, tab: UserTab): boolean {
  switch (tab) {
    case 'clientes': return extraRolesOf(u).length === 0;
    case 'lojistas': return rolesOf(u).includes('lojista');
    case 'motoboys': return rolesOf(u).includes('motoboy');
    case 'equipe': return rolesOf(u).some((r) => STAFF_ROLES.includes(r));
    case 'bloqueados': return u.status === 'blocked';
    default: return true;
  }
}

/** Usuários (D3a, tela 10). Mesma proteção de hoje: user:view_all. */
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
  const { user: me, can } = useAuth();
  const { showToast } = useToast();
  const myId = String(me?._id || me?.id || '');
  const isCeo = (me?.activeRole || me?.role) === 'ceo';
  const canRoles = can('user:manage_roles');
  const canBlock = can('user:block');

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<UserTab>('todos');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<ActionState>({ type: 'none' });

  const load = useCallback(async () => {
    setError(null);
    setUsers(null);
    try {
      const res = await api.get('/admin/users');
      if (!Array.isArray(res.data)) throw new Error('resposta inesperada');
      setUsers(res.data as AdminUser[]);
    } catch (err) {
      setError(isHttpStatus(err, 403) ? adminErrorMessage(err) : 'Não deu para carregar os usuários.');
    }
  }, []);

  useEffect(() => {
    // A sessão é por cookie httpOnly: basta haver usuário logado para ler.
    if (myId) void load();
  }, [myId, load]);

  const text = search.trim().toLowerCase();
  const matchesSearch = useCallback(
    (u: AdminUser) => !text || u.name.toLowerCase().includes(text) || (u.email || '').toLowerCase().includes(text),
    [text],
  );
  const filtered = useMemo(
    () => (users ?? []).filter((u) => inTab(u, tab) && matchesSearch(u)),
    [users, tab, matchesSearch],
  );
  const tabItems = TABS.map((t) => ({ id: t.id, label: t.label, count: (users ?? []).filter((u) => inTab(u, t.id)).length }));

  const patchUser = (id: string, patch: Partial<AdminUser>) =>
    setUsers((prev) => prev && prev.map((u) => (u._id === id ? { ...u, ...patch } : u)));
  const close = () => setAction({ type: 'none' });

  const saveRoles = async () => {
    if (action.type !== 'edit-roles') return;
    const { user, roles } = action;
    let storesClosed = 0;
    try {
      const res = await api.put(`/admin/users/${user._id}/roles`, { roles });
      // O servidor decide o papel ativo e o base: usa o que ele devolveu.
      const saved = res?.data?.user;
      patchUser(user._id, saved ? { role: saved.role, activeRole: saved.activeRole, roles: saved.roles } : { roles });
      storesClosed = Number(res?.data?.storesClosed) || 0;
    } catch (err) {
      if (!isConflictWithCode(err, 'ROLE_HAS_OPEN_WORK')) throw err;
      const data = (err as { response: { data: { role?: string; count?: number } } }).response.data;
      const error = data.role === 'motoboy'
        ? `Esta pessoa tem ${data.count} entrega(s) em andamento. Termine ou repasse antes de tirar o papel de Motoboy.`
        : `Esta pessoa tem ${data.count} pedido(s) em aberto na loja. Termine ou repasse antes de tirar o papel de Lojista.`;
      setAction({ ...action, error });
      return;
    }
    // Sem lojista ninguém opera a loja: o servidor fecha as lojas da pessoa.
    const closedText = storesClosed === 1
      ? ' A loja da pessoa foi fechada.'
      : storesClosed > 1 ? ` As ${storesClosed} lojas da pessoa foram fechadas.` : '';
    showToast(`Papéis atualizados.${closedText}`, 'success');
    close();
  };

  const block = async () => {
    if (action.type !== 'block') return;
    const reason = action.reason.trim();
    await api.put(`/admin/users/${action.user._id}/status`, { status: 'blocked', reason });
    patchUser(action.user._id, { status: 'blocked', blockReason: reason, blockedAt: new Date().toISOString() });
    showToast(`${action.user.name} foi bloqueado.`, 'success');
    close();
  };

  const unblock = async () => {
    if (action.type !== 'unblock') return;
    await api.put(`/admin/users/${action.user._id}/status`, { status: 'active' });
    patchUser(action.user._id, { status: 'active', blockReason: undefined, blockedAt: undefined });
    showToast(`${action.user.name} foi desbloqueado.`, 'success');
    close();
  };

  const disconnect = async () => {
    if (action.type !== 'disconnect') return;
    await api.post(`/admin/users/${action.user._id}/disconnect`);
    showToast(`${action.user.name} foi desconectado (se estava com o app aberto).`, 'success');
    close();
  };

  const canChangeRoleOf = (u: AdminUser) => canRoles && (isCeo || !isStaff(u));

  const columns: AdminColumn<AdminUser>[] = [
    {
      key: 'pessoa',
      header: 'Pessoa',
      primary: true,
      render: (u) => (
        <span className={styles.person}>
          <span className={styles.name}>
            <span>{u.name}</span>
            {String(u._id) === myId && <span className={styles.you}>Você</span>}
          </span>
          <span className={styles.email}>{u.email}</span>
        </span>
      ),
    },
    { key: 'papel', header: 'Papel', render: rolesText },
    {
      key: 'conta',
      header: 'Conta',
      render: (u) => {
        if (u.status === 'blocked') {
          return (
            <span className={styles.account}>
              <StatusTag tone="bad">Bloqueado</StatusTag>
              {u.blockReason && <span className={styles.reason}>{u.blockReason}</span>}
            </span>
          );
        }
        return u.status === 'inactive' ? <StatusTag tone="neutral">Inativo</StatusTag> : <StatusTag tone="ok">Ativo</StatusTag>;
      },
    },
    { key: 'criado', header: 'Criado em', render: (u) => createdAtText(u.createdAt) },
  ];

  const rowAction = (u: AdminUser) => {
    if (String(u._id) === myId) return <span className={blocks.muted}>Sua conta</span>;
    const roleBtn = canChangeRoleOf(u);
    if (!roleBtn && !canBlock) return null;
    return (
      <div className={blocks.actions}>
        {roleBtn && (
          <Button size="sm" variant="secondary" className={form.touch}
            onClick={() => setAction({ type: 'edit-roles', user: u, roles: rolesOf(u) })}>
            Papéis
          </Button>
        )}
        {canBlock && (u.status === 'blocked' ? (
          <Button size="sm" variant="secondary" className={form.touch} onClick={() => setAction({ type: 'unblock', user: u })}>
            Desbloquear
          </Button>
        ) : (
          <Button size="sm" variant="secondary" className={form.touch} onClick={() => setAction({ type: 'block', user: u, reason: '' })}>
            Bloquear
          </Button>
        ))}
        {canBlock && (
          <Button size="sm" variant="tertiary" className={form.touch} onClick={() => setAction({ type: 'disconnect', user: u })}>
            Desconectar
          </Button>
        )}
      </div>
    );
  };

  let sheetTitle = '';
  let primary: AdminSheetPrimary | undefined;
  let body: ReactNode = null;
  if (action.type === 'edit-roles') {
    const a = action;
    const toggle = (role: string, on: boolean) =>
      setAction({ ...a, error: undefined, roles: sortRoles(on ? [...a.roles, role] : a.roles.filter((r) => r !== role)) });
    sheetTitle = 'Papéis';
    primary = { label: 'Salvar', onClick: saveRoles, disabled: sameRoles(a.roles, rolesOf(a.user)) };
    body = (
      <>
        <p className={form.lead}>{a.user.name} ({a.user.email})</p>
        <div role="group" aria-label="Papéis da pessoa" className={form.field}>
          {ROLE_OPTIONS.map((r) => (
            <Checkbox
              key={r.value}
              label={r.label}
              checked={r.value === 'cliente' || a.roles.includes(r.value)}
              disabled={r.value === 'cliente' || (!isCeo && STAFF_ROLES.includes(r.value))}
              description={r.value === 'cliente' ? 'Todo mundo pode comprar' : undefined}
              onChange={(on) => toggle(r.value, on)}
            />
          ))}
        </div>
        {a.error && <p className={blocks.errText} role="alert">{a.error}</p>}
        <p className={blocks.muted}>A sessão aberta da pessoa é desconectada para os papéis novos valerem.</p>
      </>
    );
  } else if (action.type === 'block') {
    const a = action;
    sheetTitle = 'Bloquear conta';
    primary = { label: 'Bloquear', tone: 'danger', onClick: block, disabled: !a.reason.trim() };
    body = (
      <>
        <p className={form.lead}>{a.user.name} ({a.user.email})</p>
        <label className={form.field}>
          <span className={form.fieldLabel}>Motivo (obrigatório)</span>
          <textarea
            className={form.textarea}
            rows={3}
            value={a.reason}
            placeholder="Ex.: fraude detectada, violação dos termos de uso"
            onChange={(e) => setAction({ ...a, reason: e.target.value })}
          />
        </label>
        <p className={blocks.muted}>
          Se o app dela estiver aberto, ela sai na hora. Ela não consegue entrar até ser desbloqueada.
        </p>
      </>
    );
  } else if (action.type === 'unblock') {
    const a = action;
    sheetTitle = 'Desbloquear conta';
    primary = { label: 'Desbloquear', onClick: unblock };
    body = (
      <>
        <p className={form.lead}>{a.user.name} ({a.user.email})</p>
        <p className={blocks.muted}>Depois de desbloquear, {a.user.name} pode entrar e usar o app normalmente.</p>
        {a.user.blockReason && <p className={blocks.muted}>Motivo do bloqueio: {a.user.blockReason}</p>}
      </>
    );
  } else if (action.type === 'disconnect') {
    const a = action;
    sheetTitle = 'Desconectar sessão';
    primary = { label: 'Desconectar', onClick: disconnect };
    body = (
      <>
        <p className={form.lead}>{a.user.name} ({a.user.email})</p>
        <p className={blocks.muted}>
          Se {a.user.name} estiver com o app aberto, sai na hora e volta para a tela de entrada. A conta continua ativa:
          dá para entrar de novo normalmente.
        </p>
        <p className={blocks.muted}>Se estiver sem conexão, nada acontece.</p>
      </>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nome ou e-mail"
            inputProps={{ 'aria-label': 'Buscar por nome ou e-mail' }}
          />
        </div>
      </div>

      {users && !error && (
        <div className={styles.tabs}>
          <Tabs label="Filtrar usuários" items={tabItems} value={tab} onChange={(id) => setTab(id as UserTab)} idPrefix="usuarios" />
        </div>
      )}

      <div {...(users && !error ? tabPanelProps(tab, 'usuarios') : {})}>
        <AdminTable
          caption="Usuários"
          columns={columns}
          rows={users ? filtered : null}
          rowKey={(u) => String(u._id)}
          rowLabel={(u) => u.name}
          error={error}
          onRetry={() => void load()}
          empty={text ? 'Ninguém encontrado com essa busca' : 'Nenhum usuário nesta aba'}
          rowAction={rowAction}
        />
      </div>

      {users && !error && <p className={blocks.muted}>{filtered.length} de {users.length}</p>}
      <p className={blocks.muted}>
        Ninguém bloqueia, desconecta nem muda os papéis da própria conta: peça para outra pessoa da equipe.
      </p>

      <AdminSheet open={action.type !== 'none'} title={sheetTitle} onClose={close} primary={primary}>
        {body}
      </AdminSheet>
    </div>
  );
}
