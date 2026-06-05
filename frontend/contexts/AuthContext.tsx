import React, { createContext, useContext, useEffect, useState } from 'react';
import api, { setAuthToken } from '../lib/api';

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
  token: string | null;
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
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    if (t) {
      setToken(t);
      setAuthToken(t);
    }
    if (u) setUser(JSON.parse(u));
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    const { token, user } = res.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setAuthToken(token);
    setUser(user);
    setToken(token);
    return res;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // clear cached store on logout
    try { localStorage.removeItem('myStore'); } catch (e) { /* ignore */ }
    setAuthToken(undefined);
    setUser(null);
    setToken(null);
  };

  const switchRole = async (newRole: string) => {
    const res = await api.post('/auth/switch-role', { newRole });
    const { token: newToken, user } = res.data;
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(user));
    setAuthToken(newToken);
    setUser(user);
    setToken(newToken);
    return res;
  };

  return <AuthContext.Provider value={{ user, token, login, logout, switchRole, loading, setUser }}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;
