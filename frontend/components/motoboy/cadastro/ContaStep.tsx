// frontend/components/motoboy/cadastro/ContaStep.tsx
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ListChecks } from 'lucide-react';
import blocks from '../../panel/PanelBlocks.module.css';
import { PasswordField } from '../../drop/PasswordField';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { useAuth } from '../../../contexts/AuthContext';
import api from '../../../lib/api';
import { LEGAL_VERSIONS } from '../../../lib/legalDocs';
import { maskPhone, onlyDigits } from '../../../lib/masks';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';
import { passwordStrength } from '../../../lib/passwordStrength';
import { ROUTES, authHref } from '../../../lib/routes';
import styles from './Cadastro.module.css';

/** Etapa 1 do cadastro (protótipo 9). Mesmas regras do /register; o papel motoboy vai fixo e o servidor confere. */
export function ContaStep() {
  const router = useRouter();
  const auth = useAuth() || ({} as any);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ title: string; body?: string; exists?: boolean } | null>(null);
  const strength = passwordStrength(password);
  const loginHref = authHref(ROUTES.login, MOTOBOY_ROUTES.cadastro);
  // Sem "Quanto você ganha" aqui: o repasse ao motoboy vai mudar (porcentagem). A conta de cada corrida fica em Ganhos.

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!accepted) { setError({ title: 'Aceite os Termos de Uso e a Política de Privacidade para continuar.' }); return; }
    if (!strength.ok) { setError({ title: 'A senha precisa de 8 caracteres ou mais.' }); return; }
    setLoading(true);
    try {
      await api.post('/auth/register', {
        name, email, password, telefone: onlyDigits(telefone),
        acceptedTermsVersion: LEGAL_VERSIONS.terms, acceptedPrivacyVersion: LEGAL_VERSIONS.privacy,
        role: 'motoboy',
      });
      await auth.login(email, password);
      // Com a sessão aberta, /motoboy/cadastro relê o estado e abre a Verificação.
    } catch (err: any) {
      if (err?.response?.status === 409) setError({ title: 'Esse e-mail já tem conta.', exists: true });
      else if (!err?.response) setError({ title: 'Sem conexão', body: 'Seus dados continuam aqui. Tente de novo.' });
      else setError({ title: err.response.data?.error || 'Não conseguimos criar a conta. Confira os dados.' });
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className={blocks.stack} noValidate>
      <Input id="mb-nome" label="Nome completo" value={name} onChange={setName} autoComplete="name" required />
      <Input id="mb-email" label="E-mail" type="email" value={email} onChange={setEmail} autoComplete="email" hint="Você confirma por um código de 6 dígitos." required />
      <Input id="mb-cel" label="Celular (WhatsApp)" type="tel" value={telefone} onChange={(v) => setTelefone(maskPhone(v))} autoComplete="tel" />
      <PasswordField id="mb-senha" label="Senha" value={password} onChange={setPassword} autoComplete="new-password" hint="Mínimo de 8 caracteres." />
      {password && <p className={strength.score >= 3 ? blocks.ok : blocks.meta} aria-live="polite">{strength.label}</p>}

      <label className={styles.accept}>
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        <span>Li e aceito os <Link href="/termos" target="_blank">Termos de Uso</Link> e a <Link href="/privacidade" target="_blank">Política de Privacidade</Link>.</span>
      </label>

      <ul className={blocks.list}>
        <li className={blocks.row}>
          <span className={blocks.ico} aria-hidden="true"><ListChecks size={18} /></span>
          <span className={blocks.tx}><b>Depois você vai precisar de</b><span>CPF ou RG · selfie · CNH · foto da placa</span></span>
        </li>
      </ul>

      {error && (
        <Alert tone="error" title={error.title} action={error.exists ? { label: 'Entrar', onClick: () => router.push(loginHref) } : undefined}>
          {error.body}
        </Alert>
      )}

      <div className={blocks.bar}>
        <Button type="submit" loading={loading}>Criar conta e continuar</Button>
        <small>Já tem conta? <Link href={loginHref} className={blocks.link}>Entrar</Link></small>
      </div>
    </form>
  );
}

export default ContaStep;