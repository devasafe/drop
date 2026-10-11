import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { maskEmail } from '../lib/maskEmail';
import { ROUTES, safeNext } from '../lib/routes';
import { ROLE_HOME } from '../lib/navConfig';
import { ScreenHeader } from '../components/drop/ScreenHeader';
import { PasswordField } from '../components/drop/PasswordField';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import styles from './EsqueciSenha.module.css';

const RESEND_SECONDS = 60;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function EsqueciSenhaPage() {
  const router = useRouter();
  const { acceptSession } = useAuth() || ({} as any);
  const next = safeNext(router.query.next);
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [codeError, setCodeError] = useState<string | undefined>();
  const [alert, setAlert] = useState<{ tone: 'error' | 'warning'; title: string; resend?: boolean } | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const sendCode = async () => {
    setBusy(true); setAlert(null); setCodeError(undefined);
    try {
      await api.post('/auth/forgot-password', { email });
      setStep(2); setCode(''); setWait(RESEND_SECONDS);
    } catch (err: any) {
      setAlert({ tone: 'error', title: err?.response?.data?.error || 'Não conseguimos enviar o código. Tente de novo.' });
    } finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true); setAlert(null); setCodeError(undefined);
    try {
      const { data } = await api.post('/auth/reset-password', { email, code: code.trim(), newPassword: pw });
      if (data?.blocked) { setAlert({ tone: 'warning', title: data.message }); return; }
      if (data?.user) acceptSession?.(data.user);
      // M7: como o login, cada papel entra na sua área (lojista no painel, motoboy no app dele).
      const role = (data?.user?.activeRole ?? data?.user?.role) as keyof typeof ROLE_HOME | undefined;
      router.push(next ?? (role && ROLE_HOME[role]) ?? ROUTES.inicio);
    } catch (err: any) {
      const d = err?.response?.data || {};
      if (d.code === 'RESET_CODE_LOCKED' || d.error === 'Código inválido ou expirado') {
        setAlert({ tone: 'error', title: d.error, resend: true });
      } else if (typeof d.attemptsLeft === 'number') {
        setCodeError(`Código incorreto. ${d.attemptsLeft === 1 ? 'Falta 1 tentativa' : `Faltam ${d.attemptsLeft} tentativas`}.`);
      } else {
        setAlert({ tone: 'error', title: d.error || 'Não conseguimos salvar. Tente de novo.' });
      }
    } finally { setBusy(false); }
  };

  return (
    <main className={styles.page}>
      <ScreenHeader title="Nova senha" onBack={() => (step === 2 ? setStep(1) : router.back())} />
      <div className={styles.body}>
        <div className={styles.steps} role="img" aria-label={`Passo ${step} de 2`}><i className={styles.on} /><i className={step === 2 ? styles.on : undefined} /></div>
        {step === 1 ? (
          <>
            <p className={styles.lead}>Mandamos um código de 6 dígitos para o seu e-mail.</p>
            <Input id="senha-email" label="E-mail" type="email" autoComplete="email" value={email} onChange={setEmail} />
            {alert && <Alert tone={alert.tone} title={alert.title} />}
            <Button onClick={sendCode} loading={busy} disabled={!email.includes('@')}>Enviar código</Button>
          </>
        ) : (
          <>
            <Alert tone="success" title={`Código enviado para ${maskEmail(email)}`}>Confira também o spam. Vale por 15 minutos.</Alert>
            <Input id="senha-codigo" label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} error={codeError} className={styles.code} />
            {wait > 0
              ? <p className={styles.resendWait}>{`Reenviar em ${mmss(wait)}`}</p>
              : <button type="button" className={styles.resend} onClick={sendCode}>Reenviar código</button>}
            <PasswordField id="senha-nova" label="Nova senha" value={pw} onChange={setPw} autoComplete="new-password" hint="Mínimo 8 caracteres, com número." />
            {alert && <Alert tone={alert.tone} title={alert.title} action={alert.resend ? { label: 'Enviar outro código', onClick: sendCode } : undefined} />}
            <Button onClick={save} loading={busy} disabled={code.length !== 6 || pw.length < 8}>Salvar e entrar</Button>
          </>
        )}
      </div>
    </main>
  );
}
