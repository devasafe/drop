import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import { maskCPF, maskRG, maskCNH, maskPlate } from '../lib/masks';
import OnboardingProgress from '../components/OnboardingProgress';
import OnboardingFooter from '../components/OnboardingFooter';

type St = 'none' | 'pending' | 'approved' | 'rejected';
interface CourierVer {
  verified: boolean;
  missing: string[];
  courier: { status: St; plate?: string; cnhNumber?: string; rejectionReason?: string };
  facial: { status: St; rejectionReason?: string };
}
interface DocInfo {
  status: St;
  type?: string;
  number?: string;
  rejectionReason?: string;
}

export default function VerificacaoMotoboyPage() {
  const [ver, setVer] = useState<CourierVer | null>(null);
  const [doc, setDoc] = useState<DocInfo>({ status: 'none' });
  const [account, setAccount] = useState<{ cpf: string; rg: string }>({ cpf: '', rg: '' });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  // documento
  const [docType, setDocType] = useState<'cpf' | 'rg'>('cpf');
  const [docFront, setDocFront] = useState<File | null>(null);
  const [docBack, setDocBack] = useState<File | null>(null);

  // facial
  const [selfie, setSelfie] = useState<File | null>(null);

  // CNH / placa
  const [cnh, setCnh] = useState('');
  const [plate, setPlate] = useState('');
  const [cnhPhoto, setCnhPhoto] = useState<File | null>(null);
  const [platePhoto, setPlatePhoto] = useState<File | null>(null);
  const [editCourier, setEditCourier] = useState(false);

  const router = useRouter();
  const onboarding = router.query.onboarding === '1';

  const load = async () => {
    try {
      const [c, v, u] = await Promise.all([
        api.get('/verification/motoboy/me'),
        api.get('/verification/me').catch(() => ({ data: { verification: { document: { status: 'none' } } } })),
        api.get('/user/me').catch(() => ({ data: {} })),
      ]);
      setVer(c.data);
      setDoc(v.data?.verification?.document || { status: 'none' });
      const cpf = u.data?.cpf || '';
      const rg = u.data?.rg || '';
      setAccount({ cpf, rg });
      setDocType(cpf ? 'cpf' : rg ? 'rg' : 'cpf');
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Faça login como motoboy para acessar.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const run = async (fn: () => Promise<any>, ok: string) => {
    setMsg('');
    try { await fn(); setMsg(ok); await load(); }
    catch (e: any) { setMsg(e?.response?.data?.error || 'Erro na operação.'); }
  };

  const submitDoc = () => run(async () => {
    if (!docFront || !docBack) throw { response: { data: { error: 'Envie frente e verso do documento.' } } };
    const fd = new FormData();
    fd.append('type', docType);
    fd.append('front', docFront);
    fd.append('back', docBack);
    await api.post('/verification/document', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }, 'Documento enviado para análise.');

  const sendFacial = () => run(async () => {
    if (!selfie) throw { response: { data: { error: 'Selecione a selfie.' } } };
    const fd = new FormData();
    fd.append('selfie', selfie);
    await api.post('/verification/facial', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }, 'Selfie enviada para análise.');

  const sendCourier = () => run(async () => {
    const isFirst = (ver?.courier?.status || 'none') === 'none';
    // No 1º envio as duas fotos são obrigatórias; no reenvio pode mandar só a que quer trocar.
    if (isFirst && !cnhPhoto) throw { response: { data: { error: 'Selecione a foto da CNH.' } } };
    if (isFirst && !platePhoto) throw { response: { data: { error: 'Selecione a foto da placa.' } } };
    const fd = new FormData();
    fd.append('cnhNumber', cnh);
    fd.append('plate', plate);
    if (cnhPhoto) fd.append('cnhPhoto', cnhPhoto);
    if (platePhoto) fd.append('platePhoto', platePhoto);
    await api.post('/verification/motoboy', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    setEditCourier(false);
  }, 'Dados enviados para análise.');

  if (loading) return <div style={wrap}><p>Carregando...</p></div>;
  if (err) return <div style={wrap}><div style={card}><p>{err}</p></div></div>;

  const hasCpf = !!account.cpf;
  const hasRg = !!account.rg;
  const hasAnyDoc = hasCpf || hasRg;
  const selectedNumber = docType === 'cpf' ? account.cpf : account.rg;
  const maskedNumber = docType === 'cpf' ? maskCPF(selectedNumber) : maskRG(selectedNumber);

  const cs = ver?.courier.status || 'none';
  const fs = ver?.facial.status || 'none';
  const ds = doc.status || 'none';

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        <OnboardingProgress />
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Verificação de motoboy</h1>
        <a href="/motoboy" style={{ color: '#8B5CF6', fontSize: 13, textDecoration: 'none' }}>Verificar depois →</a>
        <p style={{ color: 'rgba(255,255,255,0.6)' }}>
          {ver?.verified
            ? '✅ Você está verificado — já pode aceitar entregas.'
            : 'Conclua os passos abaixo para aceitar entregas.'}
        </p>
        {msg && <div style={banner}>{msg}</div>}

        {!onboarding && (
          <section style={card}>
            <Head title="Documento (CPF ou RG)" s={ds} />
            {ds === 'rejected' && <p style={errp}>Recusado: {doc.rejectionReason || 'reenvie com fotos legíveis.'}</p>}
            {ds === 'pending' && <p style={hint}>📋 Em análise pela nossa equipe.</p>}
            {(ds === 'none' || ds === 'rejected') && (
              !hasAnyDoc ? (
                <p style={hint}>
                  Cadastre seu CPF ou RG em <a href="/editar-conta" style={link}>Editar meus dados</a> antes de enviar o documento.
                </p>
              ) : (
                <>
                  <label style={hint}>Qual documento você vai enviar?</label>
                  <select style={input} value={docType} onChange={e => setDocType(e.target.value as any)}>
                    {hasCpf && <option value="cpf">CPF</option>}
                    {hasRg && <option value="rg">RG</option>}
                  </select>
                  <label style={hint}>Número (cadastrado em Editar meus dados)</label>
                  <input style={{ ...input, opacity: 0.7 }} value={maskedNumber} readOnly />
                  <label style={hint}>Frente</label>
                  <input type="file" accept="image/*" onChange={e => setDocFront(e.target.files?.[0] || null)} style={file} />
                  <label style={hint}>Verso</label>
                  <input type="file" accept="image/*" onChange={e => setDocBack(e.target.files?.[0] || null)} style={file} />
                  <button style={btn} onClick={submitDoc}>Enviar documento</button>
                </>
              )
            )}
          </section>
        )}

        {/* Selfie facial */}
        <section style={card}>
          <Head title="Selfie (facial)" s={fs} />
          {fs === 'rejected' && <p style={errp}>Recusado: {ver?.facial.rejectionReason || 'reenvie com boa iluminação.'}</p>}
          {fs === 'pending' && <p style={hint}>📋 Em análise pela nossa equipe.</p>}
          {(fs === 'none' || fs === 'rejected') && (
            <>
              <p style={hint}>Tire uma selfie do seu rosto (para comparar com o documento).</p>
              <input type="file" accept="image/*" onChange={e => setSelfie(e.target.files?.[0] || null)} style={file} />
              <button style={btn} onClick={sendFacial}>Enviar selfie</button>
            </>
          )}
        </section>

        {/* CNH / placa */}
        <section style={card}>
          <Head title="CNH, placa e foto da placa" s={cs} />
          {cs === 'rejected' && <p style={errp}>Recusado: {ver?.courier.rejectionReason}</p>}
          {cs === 'pending' && !editCourier && <p style={hint}>📋 Em análise pela nossa equipe.</p>}
          {cs === 'approved' && !editCourier && <p style={hint}>✅ Aprovado. Placa: {ver?.courier?.plate}</p>}
          {(cs === 'pending' || cs === 'approved') && !editCourier && (
            <button style={btn} onClick={() => { setCnh(ver?.courier?.cnhNumber || ''); setPlate(ver?.courier?.plate || ''); setEditCourier(true); }}>
              Trocar foto da placa / reenviar
            </button>
          )}
          {(cs === 'none' || cs === 'rejected' || editCourier) && (
            <>
              <input style={input} placeholder="Número de registro da CNH (11 dígitos)" value={cnh} onChange={e => setCnh(maskCNH(e.target.value))} inputMode="numeric" />
              <input style={input} placeholder="Placa da moto (ABC1D23)" value={plate} onChange={e => setPlate(maskPlate(e.target.value))} />
              <label style={hint}>Foto da CNH {editCourier && '(opcional — mantém a atual se não enviar)'}</label>
              <input type="file" accept="image/*" onChange={e => setCnhPhoto(e.target.files?.[0] || null)} style={file} />
              <label style={hint}>Foto da placa da moto {editCourier && '(opcional)'}</label>
              <input type="file" accept="image/*" onChange={e => setPlatePhoto(e.target.files?.[0] || null)} style={file} />
              <button style={btn} onClick={sendCourier}>Enviar para análise</button>
            </>
          )}
        </section>

        <p style={hint}>
          O <strong>e-mail</strong> é verificado na <a href="/verificacao" style={link}>página da conta</a>. Todos os passos
          precisam estar aprovados para liberar as entregas.
        </p>
        {ver && ver.missing.length > 0 && (
          <p style={hint}>Ainda falta: {ver.missing.join(', ')}.</p>
        )}
        <OnboardingFooter />
      </div>
    </div>
  );
}

function Head({ title, s }: { title: string; s: St }) {
  const map: Record<St, [string, string]> = {
    approved: ['✅ Aprovado', '#22C55E'],
    pending: ['Em análise', '#F59E0B'],
    rejected: ['Recusado', '#EF4444'],
    none: ['Pendente', 'rgba(255,255,255,0.5)'],
  };
  const [label, color] = map[s];
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
const link: React.CSSProperties = { color: '#8B5CF6' };
