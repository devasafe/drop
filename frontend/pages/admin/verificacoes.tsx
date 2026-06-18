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

  // ── Agrupa tudo do mesmo dono/loja num card único ──
  const ownerId = (v: any): string =>
    !v ? '' : typeof v === 'object' ? String(v._id || '') : String(v);

  const docsByOwner = new Map<string, any>(docs.map((u) => [String(u._id), u]));
  const facialByOwner = new Map<string, any>(facialOwners.map((u) => [String(u._id), u]));

  // Agrupa as lojas pendentes pelo dono
  const groupsMap = new Map<string, { owner: any; stores: any[] }>();
  for (const s of stores) {
    const oid = ownerId(s.ownerId);
    const ownerObj = s.ownerId && typeof s.ownerId === 'object' ? s.ownerId : null;
    if (!groupsMap.has(oid)) {
      groupsMap.set(oid, { owner: ownerObj || { _id: oid, name: 'Dono desconhecido' }, stores: [] });
    }
    groupsMap.get(oid)!.stores.push(s);
  }
  // Donos com facial pendente mas sem loja pendente também viram card
  for (const f of facialOwners) {
    const oid = String(f._id);
    if (!groupsMap.has(oid)) groupsMap.set(oid, { owner: f, stores: [] });
  }

  // Anexa documento + facial de cada dono ao seu grupo e marca os "consumidos"
  const consumedDocIds = new Set<string>();
  const groups = Array.from(groupsMap.values()).map((g) => {
    const oid = String(g.owner._id);
    const doc = docsByOwner.get(oid);
    if (doc) consumedDocIds.add(oid);
    return { ...g, doc, facial: facialByOwner.get(oid) };
  });

  // Documentos de clientes que NÃO são donos de loja
  const clientDocs = docs.filter((u) => !consumedDocIds.has(String(u._id)));

  const total = groups.length + clientDocs.length + motoboys.length;

  return (
    <ProtectedRoute required_role="ceo,gerente_geral,gerente_clientes,gerente_lojistas,gerente_motoboys">
      <div style={wrap}>
        <div style={{ maxWidth: 820, width: '100%' }}>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Verificações pendentes</h1>
          {msg && <div style={banner}>{msg}</div>}
          {loading ? <p>Carregando...</p> : total === 0 ? <p style={hint}>Nada pendente. 🎉</p> : null}

          {/* ───── LOJAS & DONOS (tudo do mesmo dono junto) ───── */}
          {groups.length > 0 && <h2 style={h2}>Lojas &amp; donos ({groups.length})</h2>}
          {groups.map((g) => {
            const storeNames = g.stores.map((s) => s.name).filter(Boolean);
            return (
              <div key={String(g.owner._id)} style={card}>
                <div style={groupHead}>
                  <div>
                    {storeNames.length > 0 && <span style={storeTag}>🏪 {storeNames.join(' · ')}</span>}
                    <div style={{ marginTop: storeNames.length ? 6 : 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{g.owner.name || 'Usuário'}</strong>
                      <TypeBadge user={g.owner} />
                      {g.owner.email && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{g.owner.email}</span>}
                    </div>
                  </div>
                </div>

                {/* Documento do dono (Fase 1) */}
                {g.doc && (
                  <div style={sub}>
                    <p style={subLabel}>📄 Documento</p>
                    <p style={hint}>
                      Tipo: {g.doc.verification?.document?.type?.toUpperCase()} · Nº {g.doc.verification?.document?.number || '-'}
                    </p>
                    <Imgs urls={[g.doc.verification?.document?.frontUrl, g.doc.verification?.document?.backUrl]} labels={['Frente', 'Verso']} />
                    <Actions
                      onApprove={() => approve(`/verification/admin/${g.doc._id}/approve`)}
                      onReject={() => reject(`/verification/admin/${g.doc._id}/reject`)}
                    />
                  </div>
                )}

                {/* Facial do dono (Fase 2) */}
                {g.facial && (
                  <div style={sub}>
                    <p style={subLabel}>🤳 Facial / selfie (comparar com o documento)</p>
                    <Imgs urls={[g.facial.verification?.facial?.selfieUrl]} labels={['Selfie']} />
                    <Actions
                      onApprove={() => approve(`/verification/admin/facial/${g.facial._id}/approve`)}
                      onReject={() => reject(`/verification/admin/facial/${g.facial._id}/reject`)}
                    />
                  </div>
                )}

                {/* CNPJ e endereço de cada loja do dono */}
                {g.stores.map((s) => (
                  <React.Fragment key={s._id}>
                    {s.verification?.cnpj?.status === 'pending' && (
                      <div style={sub}>
                        <p style={subLabel}>🧾 CNPJ — {s.name}</p>
                        <p style={hint}>{s.verification.cnpj.number} · {s.verification.cnpj.razaoSocial || '?'} · {s.verification.cnpj.situacao || '?'}</p>
                        <Actions
                          onApprove={() => approve(`/verification/admin/store/${s._id}/cnpj/approve`)}
                          onReject={() => reject(`/verification/admin/store/${s._id}/cnpj/reject`)}
                        />
                      </div>
                    )}
                    {s.verification?.address?.status === 'pending' && (
                      <div style={sub}>
                        <p style={subLabel}>📍 Endereço — {s.name}</p>
                        <Imgs urls={[s.verification.address.comprovanteUrl]} labels={['Comprovante']} />
                        <Actions
                          onApprove={() => approve(`/verification/admin/store/${s._id}/address/approve`)}
                          onReject={() => reject(`/verification/admin/store/${s._id}/address/reject`)}
                        />
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            );
          })}

          {/* ───── CLIENTES (documento, sem loja) ───── */}
          {clientDocs.length > 0 && <h2 style={h2}>Documentos de clientes ({clientDocs.length})</h2>}
          {clientDocs.map((u) => (
            <div key={u._id} style={card}>
              <Row user={u} name={u.name} email={u.email} extra={`Tipo: ${u.verification?.document?.type?.toUpperCase()} · Nº ${u.verification?.document?.number || '-'}`} />
              <Imgs urls={[u.verification?.document?.frontUrl, u.verification?.document?.backUrl]} labels={['Frente', 'Verso']} />
              <Actions
                onApprove={() => approve(`/verification/admin/${u._id}/approve`)}
                onReject={() => reject(`/verification/admin/${u._id}/reject`)}
              />
            </div>
          ))}

          {/* ───── MOTOBOYS ───── */}
          {motoboys.length > 0 && <h2 style={h2}>Motoboys — CNH/placa ({motoboys.length})</h2>}
          {motoboys.map((u) => (
            <div key={u._id} style={card}>
              <Row user={u} name={u.name} email={u.email} extra={`CNH: ${u.verification?.courier?.cnhNumber || '-'} · Placa: ${u.verification?.courier?.plate || '-'}`} />
              <Imgs urls={[u.verification?.courier?.cnhPhotoUrl, u.verification?.courier?.platePhotoUrl, u.verification?.facial?.selfieUrl]} labels={['Foto da CNH', 'Foto da placa', 'Selfie']} />
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

function userType(u: any): { label: string; color: string } {
  const roles: string[] = u?.roles || (u?.role ? [u.role] : []);
  if (roles.includes('lojista')) return { label: 'Lojista', color: '#8B5CF6' };
  if (roles.includes('motoboy')) return { label: 'Motoboy', color: '#38BDF8' };
  return { label: 'Cliente', color: '#22C55E' };
}

function TypeBadge({ user }: { user: any }) {
  const t = userType(user);
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${t.color}22`, color: t.color, border: `1px solid ${t.color}55` }}>
      {t.label}
    </span>
  );
}

function Row({ name, email, extra, user }: { name: string; email?: string; extra?: string; user?: any }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{name}</strong>
        {user && <TypeBadge user={user} />}
        {email && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{email}</span>}
      </div>
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
const subLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)', margin: '0 0 4px' };
const groupHead: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 };
const storeTag: React.CSSProperties = { display: 'inline-block', background: 'rgba(108,43,217,0.15)', border: '1px solid #6C2BD9', borderRadius: 8, padding: '2px 10px', fontSize: 12, fontWeight: 600, color: '#C4B5FD' };
const h2: React.CSSProperties = { fontFamily: 'Space Grotesk, sans-serif', marginTop: 28, fontSize: 18 };
const banner: React.CSSProperties = { background: 'rgba(108,43,217,0.15)', border: '1px solid #6C2BD9', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 };
const hint: React.CSSProperties = { color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '4px 0' };
const btn: React.CSSProperties = { color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' };
