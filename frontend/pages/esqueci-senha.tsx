import { useState } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import styles from './Login.module.css';

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

  return (
    <div className={styles.page}>
      <div className={styles.glow} />
      <div className={styles.card}>
        <div className={styles.logoWrapper}>
          <div className={styles.logoimg}>
            <img src="/images/logog_png.png" alt="DROP" />
          </div>
          <p className={styles.logoSubtitle}>
            {step === 3 ? 'Senha redefinida' : 'Recuperar sua senha'}
          </p>
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}
        {notice && !error && step === 2 && (
          <div className={styles.errorBox} style={{ background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.35)', color: '#22c55e' }}>
            {notice}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={sendCode} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Email da conta</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                className={styles.input}
              />
            </div>
            <button type="submit" disabled={loading} className={styles.submitBtn}>
              {loading ? 'Enviando...' : 'Enviar código'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={resetPw} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Código (6 dígitos)</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                className={styles.input}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Nova senha</label>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                required
                placeholder="••••••••"
                className={styles.input}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Confirmar nova senha</label>
              <input
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                required
                placeholder="••••••••"
                className={styles.input}
              />
            </div>
            <button type="submit" disabled={loading} className={styles.submitBtn}>
              {loading ? 'Salvando...' : 'Redefinir senha'}
            </button>
            <a href="#" onClick={(e) => { e.preventDefault(); setStep(1); setError(''); setNotice(''); }} className={styles.forgotLink}>
              Não recebeu? Reenviar
            </a>
          </form>
        )}

        {step === 3 && (
          <div className={styles.form}>
            <div className={styles.errorBox} style={{ background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.35)', color: '#22c55e' }}>
              Senha redefinida com sucesso! Você já pode entrar com a nova senha.
            </div>
            <button onClick={() => router.push('/login')} className={styles.submitBtn}>
              Ir para o login
            </button>
          </div>
        )}

        <div className={styles.divider}>
          <div className={styles.dividerLine} />
          <span className={styles.dividerLabel}>ou</span>
          <div className={styles.dividerLine} />
        </div>
        <div className={styles.cta}>
          <a href="/login" className={styles.ctaLink}>Voltar ao login</a>
        </div>
      </div>
    </div>
  );
}
