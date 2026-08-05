import { useState } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import AuthLayout from '../components/auth/AuthLayout';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import styles from './Login.module.css';

const STEP_COPY: Record<1 | 2 | 3, { title: string; subtitle: string }> = {
  1: { title: 'Recuperar senha', subtitle: 'Informe o e-mail da sua conta e enviaremos um código de verificação.' },
  2: { title: 'Redefinir senha', subtitle: 'Digite o código recebido por e-mail e escolha uma nova senha.' },
  3: { title: 'Senha redefinida', subtitle: 'Sua senha foi alterada com sucesso.' },
};

export default function EsqueciSenhaPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const sendCode = async (e: any) => {
    e.preventDefault();
    setError(''); setNotice(''); setLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setNotice(data?.message || 'Se o email estiver cadastrado, enviamos um código.');
      setStep(2);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Falha ao enviar o código.');
    } finally {
      setLoading(false);
    }
  };

  const resetPw = async (e: any) => {
    e.preventDefault();
    setError('');
    if (pw.length < 6) { setError('A senha deve ter ao menos 6 caracteres.'); return; }
    if (pw !== pw2) { setError('As senhas não coincidem.'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { email, code: code.trim(), newPassword: pw });
      setStep(3);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Não foi possível redefinir a senha.');
    } finally {
      setLoading(false);
    }
  };

  const { title, subtitle } = STEP_COPY[step];

  return (
    <AuthLayout title={title} subtitle={subtitle}>
      {step === 1 && (
        <form onSubmit={sendCode} className={styles.form}>
          {error && <div className={styles.notice}>{error}</div>}
          <Input
            value={email}
            onChange={setEmail}
            type="email"
            placeholder="seu@email.com"
            required
            aria-label="Email da conta"
          />
          <Button type="submit" loading={loading} className={styles.submitBtn}>
            Enviar código
          </Button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={resetPw} className={styles.form}>
          {error && <div className={styles.notice}>{error}</div>}
          {notice && !error && (
            <div className={`${styles.notice} ${styles.noticeSuccess}`}>{notice}</div>
          )}
          <Input
            value={code}
            onChange={setCode}
            placeholder="000000"
            inputMode="numeric"
            maxLength={6}
            required
            aria-label="Código (6 dígitos)"
          />
          <Input
            value={pw}
            onChange={setPw}
            type="password"
            placeholder="Nova senha"
            required
            aria-label="Nova senha"
          />
          <Input
            value={pw2}
            onChange={setPw2}
            type="password"
            placeholder="Confirmar nova senha"
            required
            aria-label="Confirmar nova senha"
          />
          <Button type="submit" loading={loading} className={styles.submitBtn}>
            Redefinir senha
          </Button>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); setStep(1); setError(''); setNotice(''); }}
            className={styles.link}
          >
            Não recebeu? Reenviar
          </a>
        </form>
      )}

      {step === 3 && (
        <div className={styles.form}>
          <div className={`${styles.notice} ${styles.noticeSuccess}`}>
            Senha redefinida com sucesso! Você já pode entrar com a nova senha.
          </div>
          <Button onClick={() => router.push('/login')} className={styles.submitBtn}>
            Ir para o login
          </Button>
        </div>
      )}

      <p className={styles.switchLine}>
        <a href="/login" className={styles.link}>Voltar ao login</a>
      </p>
    </AuthLayout>
  );
}
