import { useEffect, useState } from 'react';
import api from '../lib/api';
import { maskCPF, maskRG, maskPhone, onlyDigits, cleanRG } from '../lib/masks';
import { useAuth } from '../contexts/AuthContext';
import StoreSettingsEditor from './StoreSettingsEditor';
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

      <section className={styles.card}>
        <label className={styles.hint}>Nome</label>
        <input className={styles.input} value={name} onChange={e => setName(e.target.value)} maxLength={80} />
        <label className={styles.hint}>Email</label>
        <input className={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={120} />
        <label className={styles.hint}>Telefone</label>
        <input className={styles.input} value={telefone} onChange={e => setTelefone(maskPhone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} inputMode="numeric" />
        <label className={styles.hint}>CPF</label>
        <input className={`${styles.input} ${docApproved ? styles.inputLocked : ''}`} value={cpf} onChange={e => setCpf(maskCPF(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} readOnly={docApproved} />
        <label className={styles.hint}>RG</label>
        <input className={`${styles.input} ${docApproved ? styles.inputLocked : ''}`} value={rg} onChange={e => setRg(maskRG(e.target.value))} placeholder="00.000.000-0" maxLength={12} readOnly={docApproved} />
        {docApproved && <p className={styles.warn}>CPF e RG não podem ser alterados após o documento aprovado.</p>}
        <button className={styles.btn} onClick={salvar}>Salvar alterações</button>
      </section>

      {isLojista && store && (
        <StoreSettingsEditor store={store} onSaved={(u: any) => setStore((prev: any) => ({ ...prev, ...u }))} />
      )}
    </div>
  );
}
