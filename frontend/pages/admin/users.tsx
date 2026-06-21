import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import api from '../../lib/api';
import styles from './AdminUsers.module.css';

interface AdminUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  roles?: string[];
  activeRole?: string;
  permissions?: string[];
  status: 'active' | 'inactive' | 'blocked';
  blockedAt?: string;
  blockReason?: string;
  createdAt: string;
}

const AVAILABLE_ROLES = [
  { value: 'ceo', label: 'CEO' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'gerente_geral', label: 'Gerente Geral' },
  { value: 'gerente_clientes', label: 'Gerente Clientes' },
  { value: 'gerente_lojistas', label: 'Gerente Lojistas' },
  { value: 'gerente_motoboys', label: 'Gerente Motoboys' },
  { value: 'lojista', label: 'Lojista' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'motoboy', label: 'Motoboy' },
];

type ActionState =
  | { type: 'none' }
  | { type: 'edit-role'; user: AdminUser; newRole: string }
  | { type: 'block'; user: AdminUser; reason: string }
  | { type: 'unblock'; user: AdminUser }
  | { type: 'disconnect'; user: AdminUser };

export default function AdminUsersPanel() {
  const { user: me, token } = useAuth();
  const myId = (me as any)?._id || (me as any)?.id;

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [action, setAction] = useState<ActionState>({ type: 'none' });
  const [working, setWorking] = useState(false);
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showFlash = (type: 'success' | 'error', msg: string) => {
    setFlash({ type, msg });
    setTimeout(() => setFlash(null), 3500);
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data);
    } catch (err) {
      console.error('Erro ao carregar usuarios:', err);
      showFlash('error', 'Erro ao carregar lista de usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // A sessão é mantida por cookie httpOnly — não há token em JS (é sempre null).
    // Basta haver usuário logado para buscar.
    if (me) fetchUsers();
    else setLoading(false);
  }, [me]);

  const filteredUsers = users.filter(u => {
    const roleToMatch = u.activeRole || u.role;
    const matchesFilter =
      filter === 'all' ||
      (filter === 'blocked' ? u.status === 'blocked' : roleToMatch === filter);
    const text = searchText.toLowerCase().trim();
    const matchesSearch =
      !text ||
      u.name.toLowerCase().includes(text) ||
      u.email.toLowerCase().includes(text);
    return matchesFilter && matchesSearch;
  });

  const confirmEditRole = async () => {
    if (action.type !== 'edit-role') return;
    if (!action.newRole || action.newRole === action.user.role) {
      showFlash('error', 'Selecione um role diferente do atual');
      return;
    }
    setWorking(true);
    try {
      await api.put(`/admin/users/${action.user._id}/role`, { role: action.newRole });
      setUsers(prev =>
        prev.map(u =>
          u._id === action.user._id
            ? { ...u, role: action.newRole, activeRole: action.newRole, roles: [action.newRole] }
            : u
        )
      );
      showFlash('success', `Role atualizado para ${roleLabel(action.newRole)}`);
      setAction({ type: 'none' });
    } catch (err: any) {
      showFlash('error', err?.response?.data?.error || 'Falha ao atualizar role');
    } finally {
      setWorking(false);
    }
  };

  const confirmBlock = async () => {
    if (action.type !== 'block') return;
    if (!action.reason.trim()) {
      showFlash('error', 'Informe o motivo do bloqueio');
      return;
    }
    setWorking(true);
    try {
      await api.put(`/admin/users/${action.user._id}/status`, {
        status: 'blocked',
        reason: action.reason.trim(),
      });
      setUsers(prev =>
        prev.map(u =>
          u._id === action.user._id
            ? { ...u, status: 'blocked', blockReason: action.reason.trim(), blockedAt: new Date().toISOString() }
            : u
        )
      );
      showFlash('success', `${action.user.name} foi bloqueado`);
      setAction({ type: 'none' });
    } catch (err: any) {
      showFlash('error', err?.response?.data?.error || 'Falha ao bloquear');
    } finally {
      setWorking(false);
    }
  };

  const confirmDisconnect = async () => {
    if (action.type !== 'disconnect') return;
    setWorking(true);
    try {
      await api.post(`/admin/users/${action.user._id}/disconnect`);
      showFlash('success', `${action.user.name} foi desconectado (se estiver online)`);
      setAction({ type: 'none' });
    } catch (err: any) {
      showFlash('error', err?.response?.data?.error || 'Falha ao desconectar');
    } finally {
      setWorking(false);
    }
  };

  const confirmUnblock = async () => {
    if (action.type !== 'unblock') return;
    setWorking(true);
    try {
      await api.put(`/admin/users/${action.user._id}/status`, { status: 'active' });
      setUsers(prev =>
        prev.map(u =>
          u._id === action.user._id
            ? { ...u, status: 'active', blockReason: undefined, blockedAt: undefined }
            : u
        )
      );
      showFlash('success', `${action.user.name} foi desbloqueado`);
      setAction({ type: 'none' });
    } catch (err: any) {
      showFlash('error', err?.response?.data?.error || 'Falha ao desbloquear');
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute required_permission="user:view_all">
        <div className={styles.loadingScreen}>
          <LoadingSkeleton variant="list" count={6} />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute required_permission="user:view_all">
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>
              <Icon name="users" size={20} /> Gerenciar Usuarios
            </h1>
            <p className={styles.pageSubtitle}>
              Total: {users.length} | Filtrados: {filteredUsers.length} | Bloqueados: {users.filter(u => u.status === 'blocked').length}
            </p>
          </div>

          {flash && (
            <div className={`${styles.flash} ${flash.type === 'success' ? styles.flashSuccess : styles.flashError}`}>
              {flash.msg}
            </div>
          )}

          <div className={styles.filtersRow}>
            <input
              type="text"
              placeholder="Buscar por nome ou email..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className={styles.searchInput}
            />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="all">Todos</option>
              <option value="blocked">Apenas bloqueados</option>
              <optgroup label="Por role">
                {AVAILABLE_ROLES.map(role => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className={styles.tableCard}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Nome</th>
                  <th className={styles.th}>Email</th>
                  <th className={styles.th}>Role</th>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}>Criado em</th>
                  <th className={styles.th}>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyState}>
                      Nenhum usuario encontrado
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelf = String(u._id) === String(myId);
                    const displayRole = u.activeRole || u.role;
                    return (
                      <tr key={u._id} className={styles.tr}>
                        <td className={`${styles.td} ${styles.tdName}`}>
                          {u.name}
                          {isSelf && <span className={styles.youTag}>VOCE</span>}
                        </td>
                        <td className={styles.td}>{u.email}</td>
                        <td className={styles.td}>
                          <span className={styles.roleBadge}>
                            {roleLabel(displayRole)}
                          </span>
                        </td>
                        <td className={styles.td}>
                          <span className={`${styles.statusBadge} ${u.status === 'blocked' ? styles.statusBlocked : styles.statusActive}`}>
                            {u.status === 'blocked' ? (
                              <><Icon name="ban" size={12} /> Bloqueado</>
                            ) : (
                              <><Icon name="check-circle" size={12} /> Ativo</>
                            )}
                          </span>
                          {u.status === 'blocked' && u.blockReason && (
                            <div className={styles.blockReasonText}>{u.blockReason}</div>
                          )}
                        </td>
                        <td className={styles.td}>
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className={styles.td}>
                          <div className={styles.actionsCell}>
                            <button
                              onClick={() => setAction({ type: 'edit-role', user: u, newRole: displayRole })}
                              className={styles.btnEdit}
                              disabled={isSelf}
                              title={isSelf ? 'Voce nao pode alterar o proprio role' : 'Alterar role'}
                            >
                              <Icon name="edit" size={12} /> Role
                            </button>
                            {u.status === 'blocked' ? (
                              <button
                                onClick={() => setAction({ type: 'unblock', user: u })}
                                className={styles.btnUnblock}
                                disabled={isSelf}
                              >
                                <Icon name="check-circle" size={12} /> Desbloquear
                              </button>
                            ) : (
                              <button
                                onClick={() => setAction({ type: 'block', user: u, reason: '' })}
                                className={styles.btnBlock}
                                disabled={isSelf}
                                title={isSelf ? 'Voce nao pode bloquear a propria conta' : 'Bloquear conta'}
                              >
                                <Icon name="ban" size={12} /> Bloquear
                              </button>
                            )}
                            <button
                              onClick={() => setAction({ type: 'disconnect', user: u })}
                              className={styles.btnDisconnect}
                              disabled={isSelf}
                              title={isSelf ? 'Voce nao pode desconectar a propria conta' : 'Desconecta a sessao ativa (se houver)'}
                            >
                              <Icon name="x-circle" size={12} /> Desconectar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.infoBox}>
            <p className={styles.infoBoxTitle}><Icon name="info" size={14} /> Bloqueio</p>
            <p className={styles.infoBoxText}>
              Usuarios bloqueados nao conseguem fazer login. Sessoes ja abertas continuam validas ate o token expirar.
              Voce nao pode bloquear a propria conta nem alterar o proprio role — peca para outro admin se necessario.
            </p>
          </div>
        </div>
      </div>

      {/* Modal: Editar Role */}
      {action.type === 'edit-role' && (
        <div className={styles.modalOverlay} onClick={() => !working && setAction({ type: 'none' })}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Alterar role</h3>
            <p className={styles.modalSubtitle}>{action.user.name} ({action.user.email})</p>
            <label className={styles.modalLabel}>Novo role</label>
            <select
              value={action.newRole}
              onChange={(e) => setAction({ ...action, newRole: e.target.value })}
              className={styles.modalInput}
              disabled={working}
            >
              {AVAILABLE_ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <div className={styles.modalActions}>
              <button
                className={styles.btnCancelModal}
                onClick={() => setAction({ type: 'none' })}
                disabled={working}
              >
                Cancelar
              </button>
              <button
                className={styles.btnConfirm}
                onClick={confirmEditRole}
                disabled={working || action.newRole === action.user.role}
              >
                {working ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Bloquear */}
      {action.type === 'block' && (
        <div className={styles.modalOverlay} onClick={() => !working && setAction({ type: 'none' })}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Bloquear conta</h3>
            <p className={styles.modalSubtitle}>{action.user.name} ({action.user.email})</p>
            <label className={styles.modalLabel}>Motivo (obrigatorio)</label>
            <textarea
              value={action.reason}
              onChange={(e) => setAction({ ...action, reason: e.target.value })}
              placeholder="Ex: Fraude detectada, violacao dos termos de uso, etc."
              className={styles.modalTextarea}
              rows={3}
              disabled={working}
            />
            <p className={styles.modalWarning}>
              O usuario nao podera mais fazer login ate ser desbloqueado.
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.btnCancelModal}
                onClick={() => setAction({ type: 'none' })}
                disabled={working}
              >
                Cancelar
              </button>
              <button
                className={styles.btnDanger}
                onClick={confirmBlock}
                disabled={working || !action.reason.trim()}
              >
                {working ? 'Bloqueando...' : 'Bloquear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Desconectar */}
      {action.type === 'disconnect' && (
        <div className={styles.modalOverlay} onClick={() => !working && setAction({ type: 'none' })}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Desconectar sessao</h3>
            <p className={styles.modalSubtitle}>{action.user.name} ({action.user.email})</p>
            <p className={styles.modalBody}>
              Se {action.user.name} estiver com o app aberto agora, sera deslogado imediatamente e enviado para a tela de login. A conta continua ativa — pode logar de novo normalmente.
            </p>
            <p className={styles.modalNote}>
              Se estiver offline, nao acontece nada (o app nao consegue receber o evento).
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.btnCancelModal}
                onClick={() => setAction({ type: 'none' })}
                disabled={working}
              >
                Cancelar
              </button>
              <button
                className={styles.btnConfirm}
                onClick={confirmDisconnect}
                disabled={working}
              >
                {working ? 'Desconectando...' : 'Desconectar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Desbloquear */}
      {action.type === 'unblock' && (
        <div className={styles.modalOverlay} onClick={() => !working && setAction({ type: 'none' })}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Desbloquear conta</h3>
            <p className={styles.modalSubtitle}>{action.user.name} ({action.user.email})</p>
            <p className={styles.modalBody}>
              Apos desbloquear, {action.user.name} podera fazer login e usar o app normalmente.
            </p>
            {action.user.blockReason && (
              <p className={styles.modalNote}>
                <strong>Motivo do bloqueio anterior:</strong> {action.user.blockReason}
              </p>
            )}
            <div className={styles.modalActions}>
              <button
                className={styles.btnCancelModal}
                onClick={() => setAction({ type: 'none' })}
                disabled={working}
              >
                Cancelar
              </button>
              <button
                className={styles.btnConfirm}
                onClick={confirmUnblock}
                disabled={working}
              >
                {working ? 'Desbloqueando...' : 'Desbloquear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}

function roleLabel(role?: string): string {
  if (!role) return '—';
  return AVAILABLE_ROLES.find(r => r.value === role)?.label || role;
}
