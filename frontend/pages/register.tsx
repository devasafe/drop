import { useState } from 'react';
import { useRouter } from 'next/router';
import { maskPhone, onlyDigits } from '../lib/masks';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { LEGAL_VERSIONS } from '../lib/legalDocs';
import { getFlow } from '../lib/onboardingFlow';
import AuthLayout from '../components/auth/AuthLayout';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import loginStyles from './Login.module.css';
import styles from './Register.module.css';

const ROLE_OPTIONS = [
  { value: 'cliente', label: 'Cliente', desc: 'Compre produtos' },
  { value: 'lojista', label: 'Lojista', desc: 'Venda produtos' },
  { value: 'motoboy', label: 'Motoboy', desc: 'Faça entregas' },
];

const GENDER_OPTIONS = [
  { value: '', label: 'Selecione' },
  { value: 'masculino', label: 'Masculino' },
  { value: 'feminino', label: 'Feminino' },
  { value: 'outro', label: 'Outro' },
];

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [telefone, setTelefone] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [sexo, setSexo] = useState('');
  const [role, setRole] = useState('cliente');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const router = useRouter();
  const auth = useAuth();

  const submit = async (e: any) => {
    e.preventDefault();
    setError('');
    if (!accepted) { setError('É necessário aceitar os Termos de Uso e a Política de Privacidade'); return; }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('email', email);
      formData.append('password', password);
      formData.append('role', role);
      formData.append('telefone', onlyDigits(telefone));
      formData.append('dataNascimento', dataNascimento);
      formData.append('sexo', sexo);
      formData.append('acceptedTermsVersion', LEGAL_VERSIONS.terms);
      formData.append('acceptedPrivacyVersion', LEGAL_VERSIONS.privacy);
      await api.post('/auth/register', formData);
      await auth.login(email, password);
      const first = getFlow(role)[0]?.path || '/verificacao';
      router.push(`${first}?onboarding=1`);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Falha no cadastro. Verifique seus dados.');
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Crie sua conta" subtitle="Leva menos de um minuto. O resto a gente pede depois.">
      <form onSubmit={submit} className={loginStyles.form}>
        {error && <div className={loginStyles.notice}>{error}</div>}

        <div className={styles.field}>
          <label className={styles.label}>Tipo de conta</label>
          <div className={styles.roleGrid}>
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRole(opt.value)}
                className={`${styles.roleBtn} ${role === opt.value ? styles.roleBtnActive : ''}`}
              >
                <span className={`${styles.roleBtnLabel} ${role === opt.value ? styles.roleBtnLabelActive : ''}`}>
                  {opt.label}
                </span>
                <span className={styles.roleBtnDesc}>{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <Input value={name} onChange={setName} placeholder="Nome completo" required aria-label="Nome completo" />
        <Input value={email} onChange={setEmail} type="email" placeholder="seu@email.com" required aria-label="Email" />
        <Input value={password} onChange={setPassword} type="password" placeholder="Crie uma senha" required aria-label="Senha" />
        <Input value={telefone} onChange={(v) => setTelefone(maskPhone(v))} type="tel" placeholder="(11) 99999-9999" aria-label="Telefone" />

        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.label}>Nascimento</label>
            <Input
              value={dataNascimento}
              onChange={setDataNascimento}
              type="date"
              aria-label="Data de nascimento"
              style={{ colorScheme: 'dark' }}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Gênero</label>
            <Select value={sexo} onChange={setSexo} options={GENDER_OPTIONS} />
          </div>
        </div>

        <label className={styles.acceptRow}>
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className={styles.acceptCheckbox} />
          <span>Li e aceito os <a href="/termos" target="_blank" rel="noopener">Termos de Uso</a> e a <a href="/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>.</span>
        </label>

        <Button type="submit" loading={loading} className={loginStyles.submitBtn}>
          Criar conta
        </Button>
      </form>

      <p className={loginStyles.switchLine}>
        Já tem uma conta? <a href="/login" className={loginStyles.link}>Fazer login</a>
      </p>
    </AuthLayout>
  );
}
