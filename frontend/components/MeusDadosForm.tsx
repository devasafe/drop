import { useEffect, useState } from 'react';
import api from '../lib/api';
import { maskCPF, maskRG, maskPhone, onlyDigits, cleanRG } from '../lib/masks';
import { useAuth } from '../contexts/AuthContext';
import StoreSettingsEditor from './StoreSettingsEditor';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import styles from './MeusDadosForm.module.css';

/**
 * Formulário "Meus dados" (nome, e-mail, CPF, RG) + editor da loja (lojista).
 * Reutilizável — embutido em /user-profile, /motoboy/profile e /editar-conta.
 */
export default function MeusDadosForm() {
  const { user } = useAuth() || {};
  const isLojista = (user?.activeRole || user?.role) === 'lojista';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [rg, setRg] = useState('');
  const [docApproved, setDocApproved] = useState(false);
  const [store, setStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/user/me')
      .then(({ data }) => {
        setName(data.name || '');
        setEmail(data.email || '');
        setTelefone(maskPhone(data.telefone || ''));
        setCpf(maskCPF(data.cpf || ''));
        setRg(maskRG(data.rg || ''));
        setDocApproved(data?.verification?.document?.status === 'approved');
      })
      .catch((e) => setErr(e?.response?.data?.error || 'Faça login para editar seus dados.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isLojista) { setStore(null); return; }
    let cancelled = false;
    api.get('/stores/dashboard')
      .then(({ data }) => { if (!cancelled) setStore(data.store); })
      .catch(() => { if (!cancelled) setStore(null); });
    return () => { cancelled = true; };
  }, [isLojista]);

  const salvar = async () => {
    setMsg(''); setErr('');
    try {
      const payload: any = { name, email, telefone: onlyDigits(telefone) };
      if (!docApproved) { payload.cpf = onlyDigits(cpf); payload.rg = cleanRG(rg); }
      const { data } = await api.patch('/user/me', payload);
      const reset = data?.verificationReset;
      const avisos: string[] = [];
      if (reset?.document) avisos.push('o documento precisará ser reenviado e reaprovado');
      if (reset?.email) avisos.push('o email precisará ser verificado de novo');
      setMsg('Dados salvos.' + (avisos.length ? ` Atenção: ${avisos.join(' e ')}.` : ''));
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Erro ao salvar.');
    }
  };

  if (loading) return <p className={styles.hint}>Carregando seus dados...</p>;

  return (
    <div>
      <p className={styles.hint}>Alterar <strong>CPF/RG</strong> ou <strong>email</strong> exige passar pela verificação novamente.</p>
      {msg && <div className={styles.banner}>{msg} <a href="/verificacao" className={styles.link}>Ir para verificação →</a></div>}
      {err && <div className={`${styles.banner} ${styles.bannerError}`}>{err}</div>}

      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.hint}>Nome</span>
          <Input value={name} onChange={setName} maxLength={80} />
        </label>
        <label className={styles.field}>
          <span className={styles.hint}>Email</span>
          <Input value={email} onChange={setEmail} type="email" maxLength={120} />
        </label>
        <label className={styles.field}>
          <span className={styles.hint}>Telefone</span>
          <Input value={telefone} onChange={(v) => setTelefone(maskPhone(v))} placeholder="(00) 00000-0000" maxLength={15} inputMode="numeric" />
        </label>
        <label className={styles.field}>
          <span className={styles.hint}>CPF</span>
          <Input value={cpf} onChange={(v) => setCpf(maskCPF(v))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} disabled={docApproved} />
        </label>
        <label className={styles.field}>
          <span className={styles.hint}>RG</span>
          <Input value={rg} onChange={(v) => setRg(maskRG(v))} placeholder="00.000.000-0" maxLength={12} disabled={docApproved} />
        </label>
        {docApproved && <p className={styles.warn}>CPF e RG não podem ser alterados após o documento aprovado.</p>}
        <Button variant="primary" onClick={salvar}>Salvar alterações</Button>
      </div>

      {isLojista && store && (
        <StoreSettingsEditor store={store} onSaved={(u: any) => setStore((prev: any) => ({ ...prev, ...u }))} />
      )}
    </div>
  );
}
