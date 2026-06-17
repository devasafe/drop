import { useEffect, useState } from 'react';
import api from '../lib/api';
import { maskCPF, maskRG } from '../lib/masks';

type DocStatus = 'none' | 'pending' | 'approved' | 'rejected';
interface Verification {
  email: { status: string };
  phone: { status: string };
  document: { status: DocStatus; rejectionReason?: string; type?: string };
}

export default function VerificacaoPage() {
  const [v, setV] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // email (código)
  const [emailSent, setEmailSent] = useState(false);
  const [emailCode, setEmailCode] = useState('');

  // documento
  const [docType, setDocType] = useState<'cpf' | 'rg'>('cpf');
  const [docNumber, setDocNumber] = useState('');
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);

  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      const { data } = await api.get('/verification/me');
      setV(data.verification);
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Faça login para acessar a verificação.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const action = async (fn: () => Promise<any>, ok: string) => {
    setMsg('');
    try { await fn(); setMsg(ok); await load(); }
    catch (e: any) { setMsg(e?.response?.data?.error || 'Erro na operação.'); }
  };

  const resendEmail = () => action(async () => { await api.post('/verification/email/resend'); setEmailSent(true); }, 'Código enviado! Confira seu email.');
  const verifyEmailCode = () => action(() => api.post('/verification/email/verify', { code: emailCode }), 'Email verificado!');
  const submitDoc = () => action(async () => {
    if (!front || !back) throw { response: { data: { error: 'Envie frente e verso.' } } };
    const fd = new FormData();
    fd.append('type', docType);
    fd.append('number', docNumber);
    fd.append('front', front);
    fd.append('back', back);
    await api.post('/verification/document', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }, 'Documento enviado para análise.');

  if (loading) return <div style={wrap}><p>Carregando...</p></div>;
  if (err) return <div style={wrap}><div style={card}><p>{err}</p></div></div>;

  const emailOk = v?.email.status === 'verified';
  const docStatus = v?.document.status || 'none';
  const allOk = emailOk && docStatus === 'approved';

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Verificação da conta</h1>
        <a href="/" style={{ color: '#8B5CF6', fontSize: 13, textDecoration: 'none' }}>Verificar depois →</a>
        <p style={{ color: 'rgba(255,255,255,0.6)' }}>
          {allOk ? '✅ Sua conta está totalmente verificada — você já pode comprar.'
                 : 'Conclua os passos abaixo para liberar suas compras.'}
        </p>
        {msg && <div style={banner}>{msg}</div>}

        {/* Email */}
        <section style={card}>
          <Header title="Email" ok={emailOk} />
          {!emailOk && (
            <>
              <p style={hint}>Enviaremos um código de 6 dígitos para o seu email.</p>
              <button style={btn} onClick={resendEmail}>Enviar código</button>
              {emailSent && (
                <div style={{ marginTop: 12 }}>
                  <input style={input} placeholder="Código de 6 dígitos" value={emailCode} onChange={e => setEmailCode(e.target.value)} inputMode="numeric" maxLength={6} />
                  <button style={btn} onClick={verifyEmailCode}>Verificar código</button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Documento */}
        <section style={card}>
          <Header title="Documento (CPF ou RG)" ok={docStatus === 'approved'} pending={docStatus === 'pending'} />
          {docStatus === 'pending' && <p style={hint}>📋 Em análise pela nossa equipe.</p>}
          {docStatus === 'rejected' && <p style={{ ...hint, color: '#EF4444' }}>Recusado: {v?.document.rejectionReason || 'reenvie com fotos legíveis.'}</p>}
          {(docStatus === 'none' || docStatus === 'rejected') && (
            <>
              <select style={input} value={docType} onChange={e => setDocType(e.target.value as any)}>
                <option value="cpf">CPF</option>
                <option value="rg">RG</option>
              </select>
              <input style={input} placeholder="Número do documento" value={docNumber} onChange={e => setDocNumber(docType === 'cpf' ? maskCPF(e.target.value) : maskRG(e.target.value))} />
              <label style={hint}>Frente</label>
              <input type="file" accept="image/*" onChange={e => setFront(e.target.files?.[0] || null)} style={{ color: '#fff', marginBottom: 8 }} />
              <label style={hint}>Verso</label>
              <input type="file" accept="image/*" onChange={e => setBack(e.target.files?.[0] || null)} style={{ color: '#fff', marginBottom: 8 }} />
              <button style={btn} onClick={submitDoc}>Enviar documento</button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Header({ title, ok, pending }: { title: string; ok?: boolean; pending?: boolean }) {
  const label = ok ? 'Verificado' : pending ? 'Em análise' : 'Pendente';
  const color = ok ? '#22C55E' : pending ? '#F59E0B' : 'rgba(255,255,255,0.5)';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <strong style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{title}</strong>
      <span style={{ color, fontSize: 13, fontWeight: 600 }}>{ok ? '✅ ' : ''}{label}</span>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minHeight: '100vh', background: '#0A0A0A', color: 'rgba(255,255,255,0.92)',
  display: 'flex', justifyContent: 'center', padding: 24,
};
const card: React.CSSProperties = {
  background: '#161616', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14,
  padding: 20, marginTop: 16,
};
const banner: React.CSSProperties = {
  background: 'rgba(108,43,217,0.15)', border: '1px solid #6C2BD9', borderRadius: 10,
  padding: '10px 14px', marginTop: 12, fontSize: 14,
};
const hint: React.CSSProperties = { color: 'rgba(255,255,255,0.5)', fontSize: 13, display: 'block', margin: '6px 0' };
const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: '#0A0A0A', color: '#fff',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 12px', marginBottom: 10,
};
const btn: React.CSSProperties = {
  background: '#6C2BD9', color: '#fff', border: 'none', borderRadius: 10,
  padding: '10px 16px', fontWeight: 600, cursor: 'pointer',
};
