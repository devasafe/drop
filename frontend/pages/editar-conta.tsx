import { useEffect, useState } from 'react';
import api from '../lib/api';
import { maskCPF, maskRG, onlyDigits, cleanRG } from '../lib/masks';

export default function EditarContaPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [rg, setRg] = useState('');
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

  const salvar = async () => {
    setMsg(''); setErr('');
    try {
      const { data } = await api.patch('/user/me', {
        name,
        email,
        cpf: onlyDigits(cpf),
        rg: cleanRG(rg),
      });
      const reset = data?.verificationReset;
      const avisos: string[] = [];
      if (reset?.document) avisos.push('o documento precisará ser reenviado e reaprovado');
      if (reset?.email) avisos.push('o email precisará ser verificado de novo');
      setMsg('Dados salvos.' + (avisos.length ? ` Atenção: ${avisos.join(' e ')}.` : ''));
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Erro ao salvar.');
    }
  };

  if (loading) return <div style={wrap}><p>Carregando...</p></div>;

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Editar meus dados</h1>
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
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = { minHeight: '100vh', background: '#0A0A0A', color: 'rgba(255,255,255,0.92)', display: 'flex', justifyContent: 'center', padding: 24 };
const card: React.CSSProperties = { background: '#161616', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20, marginTop: 16 };
const banner: React.CSSProperties = { background: 'rgba(108,43,217,0.15)', border: '1px solid #6C2BD9', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 };
const hint: React.CSSProperties = { color: 'rgba(255,255,255,0.5)', fontSize: 13, display: 'block', margin: '8px 0 4px' };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#0A0A0A', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 12px', marginBottom: 6 };
const btn: React.CSSProperties = { background: '#6C2BD9', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 600, cursor: 'pointer', marginTop: 14 };
