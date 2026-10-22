import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { MOTOBOY_ROUTES } from '../lib/motoboyRoutes';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { LEGAL_VERSIONS } from '../lib/legalDocs';
import { getFlow } from '../lib/onboardingFlow';
import { maskPhone, onlyDigits } from '../lib/masks';
import { passwordStrength } from '../lib/passwordStrength';
import { ROUTES, authHref, contaHref, safeNext } from '../lib/routes';
import { ScreenHeader } from '../components/drop/ScreenHeader';
import { PasswordField } from '../components/drop/PasswordField';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Tabs, tabPanelProps } from '../components/ui/Tabs';
import styles from './Register.module.css';

type Papel = 'cliente' | 'lojista' | 'motoboy';
const TITULO: Record<Papel, string> = { cliente: 'Criar conta', lojista: 'Venda na DROP', motoboy: 'Entregue com a DROP' };
const LEAD: Record<'cliente' | 'lojista', string> = {
  cliente: 'Leva menos de 1 minuto. O documento a gente pede só na primeira compra.',
  lojista: 'Leva menos de 1 minuto. Depois você monta a loja e envia os documentos.',
};
// Tipo de conta escolhido aqui mesmo: "Entregar" vai ao cadastro próprio do motoboy.
const TIPOS = [
  { id: 'cliente', label: 'Comprar' },
  { id: 'lojista', label: 'Vender' },
  { id: 'motoboy', label: 'Entregar' },
];

export default function RegisterPage() {
  const router = useRouter();
  const auth = useAuth();
  const q = router.query.papel;
  const [escolhido, setEscolhido] = useState<Papel | null>(null);
  const papel: Papel = escolhido ?? (q === 'lojista' || q === 'motoboy' ? q : 'cliente');
  const next = safeNext(router.query.next);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ title: string; body?: string; exists?: boolean } | null>(null);
  const strength = passwordStrength(password);
  // D2: o entregador tem cadastro próprio (/motoboy/cadastro). O papel continua fixado pelo servidor lá.
  useEffect(() => {
    if (papel === 'motoboy') router.replace(MOTOBOY_ROUTES.cadastro);
  }, [papel, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!accepted) { setError({ title: 'Aceite os Termos de Uso e a Política de Privacidade para continuar.' }); return; }
    if (!strength.ok) { setError({ title: 'A senha precisa de 8 caracteres ou mais.' }); return; }
    setLoading(true);
    try {
      await api.post('/auth/register', {
        name, email, password, telefone: onlyDigits(telefone),
        acceptedTermsVersion: LEGAL_VERSIONS.terms, acceptedPrivacyVersion: LEGAL_VERSIONS.privacy,
        // O servidor só aceita cliente/lojista/motoboy (lista branca); o cliente nem manda o campo.
        ...(papel !== 'cliente' ? { role: papel } : {}),
      });
      await auth.login(email, password);
      if (papel === 'cliente') router.push(contaHref('verificacao', next));
      else router.push(`${getFlow(papel)[0]?.path || '/verificacao'}?onboarding=1`);
    } catch (err: any) {
      if (err?.response?.status === 409) setError({ title: 'Esse e-mail já tem conta.', exists: true });
      else if (!err?.response) setError({ title: 'Sem conexão', body: 'Seus dados continuam aqui. Tente de novo.' });
      else setError({ title: err.response.data?.error || 'Não conseguimos criar a conta. Confira os dados.' });
      setLoading(false);
    }
  };

  const escolher = (id: string) => {
    if (id === 'motoboy') { router.push(MOTOBOY_ROUTES.cadastro); return; }
    const novo = id as Papel;
    setEscolhido(novo);
    // A URL guarda a escolha (voltar e recarregar mantêm o tipo); o next continua.
    const { papel: _antigo, ...resto } = router.query;
    router.replace({ pathname: '/register', query: novo === 'lojista' ? { ...resto, papel: 'lojista' } : resto }, undefined, { shallow: true });
  };

  if (papel === 'motoboy') return null;

  return (
    <main className={styles.page}>
      <ScreenHeader title={TITULO[papel]} onBack={() => router.back()} />
      <div className={styles.tipo}>
        <Tabs label="Tipo de conta" items={TIPOS} value={papel} onChange={escolher} idPrefix="tipo-conta" />
      </div>
      <form onSubmit={submit} className={styles.form} noValidate {...tabPanelProps(papel, 'tipo-conta')} tabIndex={-1}>
        <p className={styles.lead}>{LEAD[papel]}</p>
        <Input id="cad-nome" label="Nome completo" value={name} onChange={setName} autoComplete="name" required />
        <Input id="cad-email" label="E-mail" type="email" value={email} onChange={setEmail} autoComplete="email" required />
        <Input id="cad-cel" label="Celular" type="tel" value={telefone} onChange={(v) => setTelefone(maskPhone(v))}
          hint="Para o motoboy falar com você na entrega." autoComplete="tel" />
        <PasswordField id="cad-senha" label="Senha" value={password} onChange={setPassword} autoComplete="new-password" />
        {password && (
          <div className={styles.strength} aria-live="polite">
            <div className={styles.meter} aria-hidden="true">
              {[1, 2, 3, 4].map((i) => <i key={i} className={i <= strength.score ? styles.on : undefined} />)}
            </div>
            <span className={strength.score >= 3 ? styles.good : styles.weak}>{strength.label}</span>
          </div>
        )}
        <label className={styles.accept}>
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>Li e aceito os <Link href="/termos" target="_blank">Termos de Uso</Link> e a <Link href="/privacidade" target="_blank">Política de Privacidade</Link></span>
        </label>
        {error && (
          <Alert tone="error" title={error.title}
            action={error.exists ? { label: 'Entrar', onClick: () => router.push(authHref(ROUTES.login, next)) } : undefined}>
            {error.body}
          </Alert>
        )}
        <Button type="submit" loading={loading} className={styles.submit}>Criar conta</Button>
        <p className={styles.switchLine}>Já tem conta? <Link href={authHref(ROUTES.login, next)} className={styles.link}>Entrar</Link></p>
      </form>
    </main>
  );
}
