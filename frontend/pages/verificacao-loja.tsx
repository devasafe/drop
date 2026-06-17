import { useEffect, useState } from 'react';
import api from '../lib/api';
import { maskCNPJ } from '../lib/masks';

type St = 'none' | 'pending' | 'approved' | 'rejected';
interface StoreVer {
  isVerified: boolean;
  missing: string[];
  facial: { status: St; rejectionReason?: string };
  cnpj: { status: St; razaoSocial?: string; situacao?: string; rejectionReason?: string };
  address: { status: St; rejectionReason?: string };
}

export default function VerificacaoLojaPage() {
  const [storeId, setStoreId] = useState('');
  const [ver, setVer] = useState<StoreVer | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const [selfie, setSelfie] = useState<File | null>(null);
  const [cnpj, setCnpj] = useState('');
  const [comprovante, setComprovante] = useState<File | null>(null);

  const loadStatus = async (id: string) => {
    const { data } = await api.get(`/verification/store/${id}`);
    setVer(data);
  };

  const init = async () => {
    try {
      const { data } = await api.get('/stores/dashboard');
      const id = data?.store?._id || data?._id || data?.storeId || data?.store?.id;
      if (!id) { setErr('Não foi possível identificar sua loja.'); return; }
      setStoreId(id);
      await loadStatus(id);
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Faça login como lojista para acessar.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { init(); }, []);

  const run = async (fn: () => Promise<any>, ok: string) => {
    setMsg('');
    try { await fn(); setMsg(ok); if (storeId) await loadStatus(storeId); }
    catch (e: any) { setMsg(e?.response?.data?.error || 'Erro na operação.'); }
  };

  const sendFacial = () => run(async () => {
    if (!selfie) throw { response: { data: { error: 'Selecione a selfie.' } } };
    const fd = new FormData(); fd.append('selfie', selfie);
    await api.post('/verification/facial', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }, 'Selfie enviada para análise.');

  const sendCnpj = () => run(() => api.post(`/verification/store/${storeId}/cnpj`, { number: cnpj }), 'CNPJ enviado para análise.');

  const sendAddress = () => run(async () => {
    if (!comprovante) throw { response: { data: { error: 'Selecione o comprovante.' } } };
    const fd = new FormData(); fd.append('comprovante', comprovante);
    await api.post(`/verification/store/${storeId}/address`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }, 'Comprovante enviado para análise.');

  if (loading) return <div style={wrap}><p>Carregando...</p></div>;
  if (err) return <div style={wrap}><div style={card}><p>{err}</p></div></div>;

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Verificação da loja</h1>
        <a href="/store-dashboard" style={{ color: '#8B5CF6', fontSize: 13, textDecoration: 'none' }}>Verificar depois →</a>
        <p style={{ color: 'rgba(255,255,255,0.6)' }}>
          {ver?.isVerified
            ? '✅ Loja verificada — ela já aparece para os clientes.'
            : 'Conclua os itens abaixo para sua loja aparecer na lista e vender.'}
        </p>
        {msg && <div style={banner}>{msg}</div>}

        {ver?.missing?.includes('owner') && (
          <section style={{ ...card, border: '1px solid #F59E0B' }}>
            <strong style={{ fontFamily: 'Space Grotesk, sans-serif' }}>⚠️ Conta do dono pendente</strong>
            <p style={hint}>A loja só fica verificada depois que sua <strong>conta de usuário</strong> (email e documento) estiver verificada.</p>
            <a href="/verificacao" style={{ ...btn, display: 'inline-block', textDecoration: 'none' }}>Verificar minha conta →</a>
          </section>
        )}

        {/* Facial */}
        <section style={card}>
          <Head title="Selfie (facial do dono)" s={ver?.facial.status} />
          {ver?.facial.status === 'rejected' && <p style={errp}>Recusado: {ver.facial.rejectionReason}</p>}
          {(ver?.facial.status === 'none' || ver?.facial.status === 'rejected') && (
            <>
              <input type="file" accept="image/*" onChange={e => setSelfie(e.target.files?.[0] || null)} style={file} />
              <button style={btn} onClick={sendFacial}>Enviar selfie</button>
            </>
          )}
        </section>

        {/* CNPJ */}
        <section style={card}>
          <Head title="CNPJ" s={ver?.cnpj.status} />
          {ver?.cnpj.razaoSocial && <p style={hint}>Razão social: {ver.cnpj.razaoSocial} · {ver.cnpj.situacao}</p>}
          {ver?.cnpj.status === 'rejected' && <p style={errp}>Recusado: {ver.cnpj.rejectionReason}</p>}
          {(ver?.cnpj.status === 'none' || ver?.cnpj.status === 'rejected') && (
            <>
              <input style={input} placeholder="00.000.000/0000-00" value={cnpj} onChange={e => setCnpj(maskCNPJ(e.target.value))} />
              <button style={btn} onClick={sendCnpj}>Enviar CNPJ</button>
            </>
          )}
        </section>

        {/* Endereço */}
        <section style={card}>
          <Head title="Endereço (comprovante)" s={ver?.address.status} />
          {ver?.address.status === 'rejected' && <p style={errp}>Recusado: {ver.address.rejectionReason}</p>}
          {(ver?.address.status === 'none' || ver?.address.status === 'rejected') && (
            <>
              <p style={hint}>Envie uma conta de luz/água/internet no nome ou endereço da loja.</p>
              <input type="file" accept="image/*" onChange={e => setComprovante(e.target.files?.[0] || null)} style={file} />
              <button style={btn} onClick={sendAddress}>Enviar comprovante</button>
            </>
          )}
        </section>

        <p style={hint}>Email, telefone e documento do dono são verificados na página da conta.</p>
      </div>
    </div>
  );
}

function Head({ title, s }: { title: string; s?: St }) {
  const map: Record<string, [string, string]> = {
    approved: ['✅ Verificado', '#22C55E'], pending: ['Em análise', '#F59E0B'],
    rejected: ['Recusado', '#EF4444'], none: ['Pendente', 'rgba(255,255,255,0.5)'],
  };
  const [label, color] = map[s || 'none'];
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <strong style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{title}</strong>
      <span style={{ color, fontSize: 13, fontWeight: 600 }}>{label}</span>
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
