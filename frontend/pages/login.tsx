import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
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
    <div className={styles.page}>
      <div className={styles.glow} />

      <div className={styles.card}>

        {/* Logo */}
        <div className={styles.logoWrapper}>
          <div className={styles.logoimg}>
            <img src="/images/logog_png.png" alt="DROP" />
          </div>
          <p className={styles.logoSubtitle}>Acesse sua conta para continuar</p>
        </div>

        {/* Form */}
        <form onSubmit={submit} className={styles.form}>

          {notice && !error && (
            <div className={styles.errorBox} style={{ background: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.35)', color: '#f59e0b' }}>
              {notice}
            </div>
          )}
          {error && (
            <div className={styles.errorBox}>{error}</div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="seu@email.com"
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className={styles.input}
            />
          </div>

          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          <a href="/esqueci-senha" className={styles.forgotLink}>Esqueceu a senha?</a>
        </form>

        <div className={styles.divider}>
          <div className={styles.dividerLine} />
          <span className={styles.dividerLabel}>ou</span>
          <div className={styles.dividerLine} />
        </div>

        <div className={styles.cta}>
          <p className={styles.ctaText}>Não tem uma conta?</p>
          <a href="/register" className={styles.ctaLink}>Criar Conta</a>
        </div>

      </div>
    </div>
  );
}
