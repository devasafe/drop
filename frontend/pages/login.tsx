import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useOnline } from '../hooks/useOnline';
import AuthLayout from '../components/auth/AuthLayout';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { PasswordField } from '../components/drop/PasswordField';
import { loginErrorMessage, type AuthErrorView } from '../lib/authErrors';
import { ROUTES, authHref, safeNext } from '../lib/routes';
import styles from './Login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const cart = ((useCart() as any)?.cart ?? []) as Array<{ quantity?: number }>;
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AuthErrorView | null>(null);
  const [notice, setNotice] = useState('');
  const next = safeNext(router.query?.next);
  const items = cart.reduce((n, i) => n + (Number(i.quantity) || 0), 0);

  // Chegou por force_logout: mostra o motivo.
  useEffect(() => {
    try {
      const msg = sessionStorage.getItem('force_logout_message');
      if (msg) { setNotice(msg); sessionStorage.removeItem('force_logout_message'); }
    } catch { /* ignore */ }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await auth.login(email, password);
      // A raiz redireciona para /inicio; manter '/' preserva o contrato do loginNext.test.
      router.push(next ?? '/');
    } catch (err) {
      setError(loginErrorMessage(err));
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Entre para continuar"
      subtitle={items > 0 ? `Sua sacola com ${items} ${items === 1 ? 'item' : 'itens'} fica guardada.` : 'Acesse sua conta para continuar.'}
      footer="Ao entrar você continua de onde parou: a sacola, o pedido em andamento ou a página do produto."
    >
      <form onSubmit={submit} className={styles.form} noValidate>
        {notice && !error && <Alert tone="warning" title={notice} />}
        <Input id="login-email" label="E-mail" aria-label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} required />
        <PasswordField id="login-senha" label="Senha" ariaLabel="Senha" value={password} onChange={setPassword} autoComplete="current-password" />
        <Link href={authHref(ROUTES.esqueciSenha, next)} className={styles.forgot}>Esqueci a senha</Link>
        <Button type="submit" loading={loading} disabled={!online} className={styles.submit}>Entrar</Button>
        {!online && <p className={styles.offline}>Sem internet</p>}
        {error && <Alert tone="error" title={error.title}>{error.body}</Alert>}
      </form>
      <p className={styles.switchLine}>
        Primeira vez na DROP? <Link href={authHref(ROUTES.cadastro, next)} className={styles.link}>Criar conta</Link>
      </p>
    </AuthLayout>
  );
}
