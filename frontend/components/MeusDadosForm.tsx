import { useEffect, useState } from 'react';
import api from '../lib/api';
import { maskCPF, maskRG, onlyDigits, cleanRG } from '../lib/masks';
import { useAuth } from '../contexts/AuthContext';
import StoreSettingsEditor from './StoreSettingsEditor';

/**
 * Formulário "Meus dados" (nome, e-mail, CPF, RG) + editor da loja (lojista).
 * Reutilizável — embutido em /user-profile, /motoboy/profile e /editar-conta.
 */
export default function MeusDadosForm() {
  const { user } = useAuth() || {};
  const isLojista = (user?.activeRole || user?.role) === 'lojista';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [rg, setRg] = useState('');
  const [store, setStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/user/me')
      .then(({ data }) => {
        setName(data.name || '');
        setEmail(data.email || '');
        setCpf(maskCPF(data.cpf || ''));
        setRg(maskRG(data.rg || ''));
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
      const { data } = await api.patch('/user/me', { name, email, cpf: onlyDigits(cpf), rg: cleanRG(rg) });
      const reset = data?.verificationReset;
      const avisos: string[] = [];
      if (reset?.document) avisos.push('o documento precisará ser reenviado e reaprovado');
      if (reset?.email) avisos.push('o email precisará ser verificado de novo');
      setMsg('Dados salvos.' + (avisos.length ? ` Atenção: ${avisos.join(' e ')}.` : ''));
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Erro ao salvar.');
    }
  };

  if (loading) return <p style={hint}>Carregando seus dados...</p>;

  return (
    <div>
      <p style={hint}>Alterar <strong>CPF/RG</strong> ou <strong>email</strong> exige passar pela verificação novamente.</p>
      {msg && <div style={banner}>{msg} <a href="/verificacao" style={{ color: '#8B5CF6' }}>Ir para verificação →</a></div>}
      {err && <div style={{ ...banner, borderColor: '#EF4444', background: 'rgba(239,68,68,0.12)' }}>{err}</div>}

      <section style={card}>
        <label style={hint}>Nome</label>
        <input style={input} value={name} onChange={e => setName(e.target.value)} />
        <label style={hint}>Email</label>
        <input style={input} type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <label style={hint}>CPF</label>
        <input style={input} value={cpf} onChange={e => setCpf(maskCPF(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />
        <label style={hint}>RG</label>
        <input style={input} value={rg} onChange={e => setRg(maskRG(e.target.value))} placeholder="00.000.000-0" />
        <button style={btn} onClick={salvar}>Salvar alterações</button>
      </section>

      {isLojista && store && (
        <StoreSettingsEditor store={store} onSaved={(u: any) => setStore((prev: any) => ({ ...prev, ...u }))} />
      )}
    </div>
  );
}

const card: React.CSSProperties = { background: '#161616', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20, marginTop: 12 };
const banner: React.CSSProperties = { background: 'rgba(108,43,217,0.15)', border: '1px solid #6C2BD9', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 };
const hint: React.CSSProperties = { color: 'rgba(255,255,255,0.5)', fontSize: 13, display: 'block', margin: '8px 0 4px' };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#0A0A0A', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 12px', marginBottom: 6 };
const btn: React.CSSProperties = { background: '#6C2BD9', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 600, cursor: 'pointer', marginTop: 14 };
