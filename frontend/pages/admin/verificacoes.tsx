import React, { useEffect, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import api from '../../lib/api';

export default function AdminVerificacoes() {
  const [docs, setDocs] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [facialOwners, setFacialOwners] = useState<any[]>([]);
  const [motoboys, setMotoboys] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try {
      const [d, s, m] = await Promise.all([
        api.get('/verification/admin/pending').catch(() => ({ data: { items: [] } })),
        api.get('/verification/admin/store-pending').catch(() => ({ data: { stores: [], facialPendingOwners: [] } })),
        api.get('/verification/admin/motoboy-pending').catch(() => ({ data: { items: [] } })),
      ]);
      setDocs(d.data.items || []);
      setStores(s.data.stores || []);
      setFacialOwners(s.data.facialPendingOwners || []);
      setMotoboys(m.data.items || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const approve = async (url: string) => {
    setMsg('');
    try { await api.post(url); setMsg('Aprovado.'); await reload(); }
    catch (e: any) { setMsg(e?.response?.data?.error || 'Erro.'); }
  };
  const reject = async (url: string) => {
    const reason = window.prompt('Motivo da recusa:') || '';
    if (reason === null) return;
    setMsg('');
    try { await api.post(url, { reason }); setMsg('Recusado.'); await reload(); }
    catch (e: any) { setMsg(e?.response?.data?.error || 'Erro.'); }
  };

  const total = docs.length + stores.length + facialOwners.length + motoboys.length;

  return (
    <ProtectedRoute required_role="ceo,gerente_geral,gerente_clientes,gerente_lojistas,gerente_motoboys">
      <div style={wrap}>
        <div style={{ maxWidth: 820, width: '100%' }}>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Verificações pendentes</h1>
          {msg && <div style={banner}>{msg}</div>}
          {loading ? <p>Carregando...</p> : total === 0 ? <p style={hint}>Nada pendente. 🎉</p> : null}

          {/* CLIENTES — documento */}
          {docs.length > 0 && <h2 style={h2}>Documentos de clientes ({docs.length})</h2>}
          {docs.map((u) => (
            <div key={u._id} style={card}>
              <Row name={u.name} email={u.email} extra={`Tipo: ${u.verification?.document?.type?.toUpperCase()} · Nº ${u.verification?.document?.number || '-'}`} />
              <Imgs urls={[u.verification?.document?.frontUrl, u.verification?.document?.backUrl]} labels={['Frente', 'Verso']} />
              <Actions
                onApprove={() => approve(`/verification/admin/${u._id}/approve`)}
                onReject={() => reject(`/verification/admin/${u._id}/reject`)}
              />
            </div>
          ))}

          {/* LOJAS — facial do dono */}
          {facialOwners.length > 0 && <h2 style={h2}>Facial de donos de loja ({facialOwners.length})</h2>}
          {facialOwners.map((u) => (
            <div key={u._id} style={card}>
              <Row name={u.name} email={u.email} extra="Selfie do dono (comparar com o documento)" />
              <Imgs urls={[u.verification?.facial?.selfieUrl]} labels={['Selfie']} />
              <Actions
                onApprove={() => approve(`/verification/admin/facial/${u._id}/approve`)}
                onReject={() => reject(`/verification/admin/facial/${u._id}/reject`)}
              />
            </div>
          ))}

          {/* LOJAS — cnpj/endereço */}
          {stores.length > 0 && <h2 style={h2}>Lojas — CNPJ e endereço ({stores.length})</h2>}
          {stores.map((s) => (
            <div key={s._id} style={card}>
              <strong style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{s.name}</strong>
              {s.verification?.cnpj?.status === 'pending' && (
                <div style={sub}>
                  <p style={hint}>CNPJ: {s.verification.cnpj.number} · {s.verification.cnpj.razaoSocial || '?'} · {s.verification.cnpj.situacao || '?'}</p>
                  <Actions
                    onApprove={() => approve(`/verification/admin/store/${s._id}/cnpj/approve`)}
                    onReject={() => reject(`/verification/admin/store/${s._id}/cnpj/reject`)}
                  />
                </div>
              )}
              {s.verification?.address?.status === 'pending' && (
                <div style={sub}>
                  <p style={hint}>Comprovante de endereço:</p>
                  <Imgs urls={[s.verification.address.comprovanteUrl]} labels={['Comprovante']} />
                  <Actions
                    onApprove={() => approve(`/verification/admin/store/${s._id}/address/approve`)}
                    onReject={() => reject(`/verification/admin/store/${s._id}/address/reject`)}
                  />
                </div>
              )}
            </div>
          ))}

          {/* MOTOBOYS */}
          {motoboys.length > 0 && <h2 style={h2}>Motoboys — CNH/placa ({motoboys.length})</h2>}
          {motoboys.map((u) => (
            <div key={u._id} style={card}>
              <Row name={u.name} email={u.email} extra={`CNH: ${u.verification?.courier?.cnhNumber || '-'} · Placa: ${u.verification?.courier?.plate || '-'}`} />
              <Imgs urls={[u.verification?.courier?.platePhotoUrl, u.verification?.facial?.selfieUrl]} labels={['Foto da placa', 'Selfie']} />
              <Actions
                onApprove={() => approve(`/verification/admin/motoboy/${u._id}/approve`)}
                onReject={() => reject(`/verification/admin/motoboy/${u._id}/reject`)}
              />
            </div>
          ))}
        </div>
      </div>
    </ProtectedRoute>
  );
}

function Row({ name, email, extra }: { name: string; email?: string; extra?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <strong style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{name}</strong>
      {email && <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: 8, fontSize: 13 }}>{email}</span>}
      {extra && <p style={hint}>{extra}</p>}
    </div>
  );
}
function Imgs({ urls, labels }: { urls: (string | undefined)[]; labels: string[] }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '8px 0' }}>
      {urls.map((u, i) => u ? (
        <a key={i} href={u} target="_blank" rel="noreferrer" style={{ textAlign: 'center' }}>
          <img src={u} alt={labels[i]} style={{ width: 140, height: 100, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)' }} />
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{labels[i]}</div>
        </a>
      ) : null)}
    </div>
  );
}
function Actions({ onApprove, onReject }: { onApprove: () => void; onReject: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      <button style={{ ...btn, background: '#22C55E' }} onClick={onApprove}>Aprovar</button>
      <button style={{ ...btn, background: '#EF4444' }} onClick={onReject}>Recusar</button>
    </div>
  );
}

const wrap: React.CSSProperties = { minHeight: '100vh', background: '#0A0A0A', color: 'rgba(255,255,255,0.92)', display: 'flex', justifyContent: 'center', padding: 24 };
const card: React.CSSProperties = { background: '#161616', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 18, marginTop: 12 };
const sub: React.CSSProperties = { borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 10, paddingTop: 10 };
const h2: React.CSSProperties = { fontFamily: 'Space Grotesk, sans-serif', marginTop: 28, fontSize: 18 };
const banner: React.CSSProperties = { background: 'rgba(108,43,217,0.15)', border: '1px solid #6C2BD9', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 };
const hint: React.CSSProperties = { color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '4px 0' };
const btn: React.CSSProperties = { color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' };
