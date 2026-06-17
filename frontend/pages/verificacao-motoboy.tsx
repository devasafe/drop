import { useEffect, useState } from 'react';
import api from '../lib/api';

type St = 'none' | 'pending' | 'approved' | 'rejected';
interface CourierVer {
  verified: boolean;
  missing: string[];
  courier: { status: St; plate?: string; rejectionReason?: string };
  facial: { status: St };
}

export default function VerificacaoMotoboyPage() {
  const [ver, setVer] = useState<CourierVer | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const [cnh, setCnh] = useState('');
  const [plate, setPlate] = useState('');
  const [platePhoto, setPlatePhoto] = useState<File | null>(null);

  const load = async () => {
    try {
      const { data } = await api.get('/verification/motoboy/me');
      setVer(data);
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Faça login como motoboy para acessar.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const sendCourier = async () => {
    setMsg('');
    try {
      if (!platePhoto) { setMsg('Selecione a foto da placa.'); return; }
      const fd = new FormData();
      fd.append('cnhNumber', cnh);
      fd.append('plate', plate);
      fd.append('platePhoto', platePhoto);
      await api.post('/verification/motoboy', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMsg('Dados enviados para análise.');
      await load();
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Erro ao enviar.');
    }
  };

  if (loading) return <div style={wrap}><p>Carregando...</p></div>;
  if (err) return <div style={wrap}><div style={card}><p>{err}</p></div></div>;

  const cs = ver?.courier.status || 'none';
  const map: Record<string, [string, string]> = {
    approved: ['✅ Aprovado', '#22C55E'], pending: ['Em análise', '#F59E0B'],
    rejected: ['Recusado', '#EF4444'], none: ['Pendente', 'rgba(255,255,255,0.5)'],
  };
  const [label, color] = map[cs];

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Verificação de motoboy</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)' }}>
          {ver?.verified
            ? '✅ Você está verificado — já pode aceitar entregas.'
            : 'Conclua os passos abaixo para aceitar entregas.'}
        </p>
        {msg && <div style={banner}>{msg}</div>}

        <section style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontFamily: 'Space Grotesk, sans-serif' }}>CNH, placa e foto da placa</strong>
            <span style={{ color, fontSize: 13, fontWeight: 600 }}>{label}</span>
          </div>
          {cs === 'rejected' && <p style={errp}>Recusado: {ver?.courier.rejectionReason}</p>}
          {(cs === 'none' || cs === 'rejected') && (
            <>
              <input style={input} placeholder="Número de registro da CNH (11 dígitos)" value={cnh} onChange={e => setCnh(e.target.value)} />
              <input style={input} placeholder="Placa da moto (ABC1D23)" value={plate} onChange={e => setPlate(e.target.value)} />
              <label style={hint}>Foto da placa da moto</label>
              <input type="file" accept="image/*" onChange={e => setPlatePhoto(e.target.files?.[0] || null)} style={file} />
              <button style={btn} onClick={sendCourier}>Enviar para análise</button>
            </>
          )}
          {cs === 'pending' && <p style={hint}>📋 Em análise pela nossa equipe.</p>}
        </section>

        <p style={hint}>
          Email, telefone, documento (CPF/RG) e a <strong>selfie facial</strong> são verificados na
          página da conta (/verificacao). Todos precisam estar aprovados para liberar entregas.
        </p>
        {ver && ver.missing.length > 0 && (
          <p style={hint}>Ainda falta: {ver.missing.join(', ')}.</p>
        )}
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = { minHeight: '100vh', background: '#0A0A0A', color: 'rgba(255,255,255,0.92)', display: 'flex', justifyContent: 'center', padding: 24 };
const card: React.CSSProperties = { background: '#161616', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20, marginTop: 16 };
const banner: React.CSSProperties = { background: 'rgba(108,43,217,0.15)', border: '1px solid #6C2BD9', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 };
const hint: React.CSSProperties = { color: 'rgba(255,255,255,0.5)', fontSize: 13, display: 'block', margin: '6px 0' };
const errp: React.CSSProperties = { color: '#EF4444', fontSize: 13, margin: '6px 0' };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#0A0A0A', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 12px', marginBottom: 10 };
const file: React.CSSProperties = { color: '#fff', marginBottom: 10, display: 'block' };
const btn: React.CSSProperties = { background: '#6C2BD9', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' };
