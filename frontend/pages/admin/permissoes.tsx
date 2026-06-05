import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import useRequireAuth from '../../hooks/useRequireAuth';
import ProtectedRoute from '../../components/ProtectedRoute';
import styles from './Permissoes.module.css';

interface PermissionDef {
  key: string;
  label: string;
  category: string;
}

interface RoleData {
  role: string;
  permissions: string[];
  notificationTargets: string[];
  isCustom: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  ceo: 'CEO',
  marketing: 'Marketing',
  gerente_geral: 'Gerente Geral',
  gerente_clientes: 'Gerente de Clientes',
  gerente_lojistas: 'Gerente de Lojistas',
  gerente_motoboys: 'Gerente de Motoboys',
  lojista: 'Lojista',
  cliente: 'Cliente',
  motoboy: 'Motoboy',
};

export default function AdminPermissoes() {
  useRequireAuth(['ceo']);
  const router = useRouter();

  const [allRoles, setAllRoles] = useState<string[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionDef[]>([]);
  const [rolesData, setRolesData] = useState<RoleData[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('marketing');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [notifTargets, setNotifTargets] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    api.get('/role-permissions').then(res => {
      setAllRoles(res.data.allRoles);
      setAllPermissions(res.data.allPermissions);
      setRolesData(res.data.roles);
      // carrega o role selecionado inicial
      const initial = res.data.roles.find((r: RoleData) => r.role === selectedRole);
      if (initial) {
        setPermissions(initial.permissions);
        setNotifTargets(initial.notificationTargets);
      }
    });
  }, []);

  const loadRole = (role: string) => {
    setSelectedRole(role);
    const data = rolesData.find(r => r.role === role);
    if (data) {
      setPermissions(data.permissions);
      setNotifTargets(data.notificationTargets);
    }
    setSaved(false);
  };

  const togglePerm = (key: string) => {
    setPermissions(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
  };

  const toggleTarget = (role: string) => {
    setNotifTargets(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.put(`/role-permissions/${selectedRole}`, { permissions, notificationTargets: notifTargets });
      setSaved(true);
      // Atualiza o cache local
      setRolesData(prev => prev.map(r => r.role === selectedRole ? { ...r, permissions, notificationTargets: notifTargets, isCustom: true } : r));
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm(`Restaurar permissões padrão para ${ROLE_LABELS[selectedRole]}?`)) return;
    setResetting(true);
    try {
      await api.delete(`/role-permissions/${selectedRole}`);
      // Recarrega
      const res = await api.get('/role-permissions');
      setRolesData(res.data.roles);
      const updated = res.data.roles.find((r: RoleData) => r.role === selectedRole);
      if (updated) { setPermissions(updated.permissions); setNotifTargets(updated.notificationTargets); }
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao restaurar');
    } finally {
      setResetting(false);
    }
  };

  // Agrupa permissões por categoria
  const categories = Array.from(new Set(allPermissions.map(p => p.category)));

  const isCEO = selectedRole === 'ceo';

  return (
    <ProtectedRoute required_role="ceo">
      <div className={styles.page}>
        <div className={styles.container}>

          {/* Header */}
          <div className={styles.header}>
            <button onClick={() => router.push('/admin/dashboard')} className={styles.backBtn}>
              ← Dashboard
            </button>
            <h1 className={styles.title}>Gerenciar Permissões</h1>
            <p className={styles.subtitle}>Controle o que cada cargo pode fazer no sistema</p>
          </div>

          <div className={styles.layout}>
            {/* Sidebar — lista de roles */}
            <aside className={styles.sidebar}>
              {allRoles.map(role => {
                const data = rolesData.find(r => r.role === role);
                return (
                  <button
                    key={role}
                    onClick={() => loadRole(role)}
                    className={`${styles.roleBtn} ${selectedRole === role ? styles.roleBtnActive : ''}`}
                  >
                    <span className={styles.roleLabel}>{ROLE_LABELS[role] || role}</span>
                    {data?.isCustom && <span className={styles.customBadge}>Customizado</span>}
                  </button>
                );
              })}
            </aside>

            {/* Painel de permissões */}
            <main className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>{ROLE_LABELS[selectedRole] || selectedRole}</h2>
                  {isCEO && <p className={styles.panelNote}>O CEO tem acesso total e não pode ser editado.</p>}
                </div>
                {!isCEO && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {saved && <span className={styles.savedMsg}>Salvo!</span>}
                    <button onClick={handleReset} disabled={resetting} className={styles.btnReset}>
                      {resetting ? '...' : 'Restaurar padrão'}
                    </button>
                    <button onClick={handleSave} disabled={saving || isCEO} className={styles.btnSave}>
                      {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                )}
              </div>

              {isCEO ? (
                <div className={styles.ceoBanner}>
                  O CEO possui acesso irrestrito a todas as funções do sistema. Suas permissões não podem ser alteradas.
                </div>
              ) : (
                <>
                  {/* Permissões por categoria */}
                  {categories.map(cat => (
                    <div key={cat} className={styles.categoryBlock}>
                      <h3 className={styles.categoryTitle}>{cat}</h3>
                      <div className={styles.permGrid}>
                        {allPermissions.filter(p => p.category === cat).map(perm => (
                          <label key={perm.key} className={styles.permItem}>
                            <input
                              type="checkbox"
                              checked={permissions.includes(perm.key)}
                              onChange={() => togglePerm(perm.key)}
                              className={styles.permCheck}
                            />
                            <span className={styles.permLabel}>{perm.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Targets de notificação */}
                  {(permissions.includes('notification:create') || permissions.includes('broadcast:send')) && (
                    <div className={styles.categoryBlock}>
                      <h3 className={styles.categoryTitle}>Pode enviar notificações para</h3>
                      <p className={styles.categoryNote}>Selecione quais grupos este cargo pode notificar</p>
                      <div className={styles.permGrid}>
                        {allRoles.filter(r => r !== 'ceo').map(role => (
                          <label key={role} className={styles.permItem}>
                            <input
                              type="checkbox"
                              checked={notifTargets.includes(role)}
                              onChange={() => toggleTarget(role)}
                              className={styles.permCheck}
                            />
                            <span className={styles.permLabel}>{ROLE_LABELS[role] || role}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </main>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
