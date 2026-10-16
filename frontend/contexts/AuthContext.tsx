import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../lib/api';

export type AuthUser = {
  _id?: string;
  id: string;
  name: string;
  email: string;
  role: string;
  activeRole?: string;
  roles?: string[];
  storeId?: string;
  mainAddress?: any;
  photo?: string | null;
};

interface AuthContextType {
  user: AuthUser | null;
  token: string | null; // mantido por compat; a sessão agora é pelo cookie httpOnly
  loading: boolean;
  activeRole?: string;
  permissions: string[];
  /** Papéis de equipe da conta (marketing/gerentes): acréscimo, não área ativa. */
  teamRoles: string[];
  permissionsLoading: boolean;
  can: (permission: string) => boolean;
  login: (email: string, password: string) => Promise<any>;
  logout: () => void;
  switchRole: (newRole: string) => Promise<any>;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  acceptSession: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [teamRoles, setTeamRoles] = useState<string[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);

  useEffect(() => {
    // A sessão é mantida pelo cookie httpOnly (não acessível via JS).
    // Aqui lemos apenas os DADOS do usuário (não-sensíveis) para a UI.
    try {
      const u = localStorage.getItem('user');
      if (u) setUser(JSON.parse(u));
      localStorage.removeItem('token'); // migração: remove token legado do localStorage
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  // Carrega as permissões efetivas do usuário: a UNIÃO do papel ativo com os papéis de equipe
  // da conta (equipe é acréscimo), e quais são esses papéis. Re-busca quando o usuário ou o papel
  // ativo muda (ex: switchRole) e quando a tela volta ao foco (papel concedido com a pessoa logada).
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setPermissions([]);
      setTeamRoles([]);
      return;
    }
    const load = (initial: boolean) => {
      if (initial) setPermissionsLoading(true);
      api.get('/role-permissions/me')
        .then((res) => {
          if (cancelled) return;
          setPermissions(res.data?.permissions || []);
          setTeamRoles(Array.isArray(res.data?.teamRoles) ? res.data.teamRoles : []);
        })
        .catch(() => {
          // Na releitura por foco, um erro passageiro não derruba o que já foi lido.
          if (!cancelled && initial) { setPermissions([]); setTeamRoles([]); }
        })
        .finally(() => { if (!cancelled && initial) setPermissionsLoading(false); });
    };
    load(true);
    const onFocus = () => load(false);
    const onVisible = () => { if (document.visibilityState === 'visible') load(false); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.id, user?.activeRole]);

  // CEO tem acesso total SEMPRE (via papel), independente da API de permissões ter
  // carregado ou não — evita travar o CEO se /role-permissions/me falhar/atrasar.
  const isCeo = (user?.activeRole || user?.role) === 'ceo';
  const can = (permission: string) =>
    isCeo || permissions.includes('*') || permissions.includes(permission);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    const { user } = res.data; // backend já setou o cookie httpOnly
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
    return res;
  };

  // Sessão aberta por outra rota que não o login (ex.: redefinir a senha): o cookie httpOnly já veio do servidor.
  const acceptSession = (u: AuthUser) => {
    try { localStorage.setItem('user', JSON.stringify(u)); } catch { /* ignore */ }
    setUser(u);
  };

  const logout = () => {
    // Limpa o cookie no servidor (best-effort) e os dados locais
    api.post('/auth/logout').catch(() => { /* ignore */ });
    try {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      localStorage.removeItem('myStore');
    } catch { /* ignore */ }
    setUser(null);
  };

  const switchRole = async (newRole: string) => {
    const res = await api.post('/auth/switch-role', { newRole });
    const { user } = res.data; // backend atualizou o cookie httpOnly com o novo role
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
    return res;
  };

  return (
    <AuthContext.Provider value={{ user, token: null, login, logout, switchRole, loading, permissions, teamRoles, permissionsLoading, can, setUser, acceptSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;
