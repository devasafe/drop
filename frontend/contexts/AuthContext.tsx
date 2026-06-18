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
};

interface AuthContextType {
  user: AuthUser | null;
  token: string | null; // mantido por compat; a sessão agora é pelo cookie httpOnly
  loading: boolean;
  activeRole?: string;
  login: (email: string, password: string) => Promise<any>;
  logout: () => void;
  switchRole: (newRole: string) => Promise<any>;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

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

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    const { user } = res.data; // backend já setou o cookie httpOnly
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
    return res;
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
    <AuthContext.Provider value={{ user, token: null, login, logout, switchRole, loading, setUser }}>
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
