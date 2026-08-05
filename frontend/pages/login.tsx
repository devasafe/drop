import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import AuthLayout from '../components/auth/AuthLayout';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import styles from './Login.module.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const router = useRouter();
  const auth = useAuth();

  // Se chegou aqui por force_logout, mostra o motivo
  useEffect(() => {
    try {
      const msg = typeof window !== 'undefined' ? sessionStorage.getItem('force_logout_message') : null;
      if (msg) {
        setNotice(msg);
        sessionStorage.removeItem('force_logout_message');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const submit = async (e: any) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await auth.login(email, password);
      router.push('/');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Falha no login. Verifique seus dados.');
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Bem-vindo de volta" subtitle="Acesse sua conta para continuar">
      <form onSubmit={submit} className={styles.form}>
        {notice && !error && <div className={`${styles.notice} ${styles.noticeWarning}`}>{notice}</div>}
        {error && <div className={styles.notice}>{error}</div>}

        <Input
          value={email}
          onChange={setEmail}
          type="email"
          placeholder="seu@email.com"
          required
          aria-label="Email"
        />
        <Input
          value={password}
          onChange={setPassword}
          type="password"
          placeholder="••••••••"
          required
          aria-label="Senha"
        />

        <Button type="submit" loading={loading} className={styles.submitBtn}>
          Entrar
        </Button>

        <a href="/esqueci-senha" className={styles.link}>Esqueceu a senha?</a>
      </form>

      <p className={styles.switchLine}>
        Não tem conta? <a href="/register" className={styles.link}>Criar conta</a>
      </p>
    </AuthLayout>
  );
}
