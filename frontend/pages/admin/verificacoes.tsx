import React, { useEffect, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import api from '../../lib/api';

interface AggUser {
  _id: string;
  name: string;
  email?: string;
  roles: string[];
  doc?: any;       // verification.document (pendente)
  facial?: any;    // verification.facial (pendente)
  courier?: any;   // verification.courier (pendente)
  stores: any[];   // lojas com cnpj/endereço pendente
}

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

  // ── Agrega todas as pendências do MESMO usuário num único registro ──
  const byId = new Map<string, AggUser>();
  const ensureUser = (id: string, base?: any): AggUser => {
    if (!byId.has(id)) byId.set(id, { _id: id, name: '', roles: [], stores: [] });
    const u = byId.get(id)!;
    if (base) {
      if (base.name) u.name = base.name;
      if (base.email) u.email = base.email;
      const r: string[] = base.roles || (base.role ? [base.role] : []);
      if (r.length) u.roles = Array.from(new Set([...u.roles, ...r]));
    }
    return u;
  };

  for (const d of docs) {
    const u = ensureUser(String(d._id), d);
    u.doc = d.verification?.document || null;
  }
  for (const f of facialOwners) {
    const u = ensureUser(String(f._id), f);
    u.facial = f.verification?.facial || u.facial;
  }
  for (const m of motoboys) {
    const u = ensureUser(String(m._id), m);
    u.courier = m.verification?.courier || null;
    if (!u.facial && m.verification?.facial?.status === 'pending') u.facial = m.verification.facial;
    if (!u.roles.includes('motoboy')) u.roles.push('motoboy');
  }
  for (const s of stores) {
    const owner = s.ownerId && typeof s.ownerId === 'object' ? s.ownerId : null;
    const oid = owner?._id ? String(owner._id) : (typeof s.ownerId === 'string' ? s.ownerId : '');
    if (!oid) continue;
    const u = ensureUser(oid, owner);
    u.stores.push(s);
    if (!u.roles.includes('lojista')) u.roles.push('lojista');
  }

  const all = Array.from(byId.values());
  const isLojista = (u: AggUser) => u.roles.includes('lojista') || u.stores.length > 0;
  const isMotoboy = (u: AggUser) => !isLojista(u) && (u.roles.includes('motoboy') || !!u.courier);

  const lojistas = all.filter(isLojista);
  const motoboyUsers = all.filter(isMotoboy);
  const clientes = all.filter((u) => !isLojista(u) && !isMotoboy(u));

  const total = lojistas.length + motoboyUsers.length + clientes.length;

  return (
    <ProtectedRoute required_permission="verification:view_queue">
      <div style={wrap}>
        <div style={{ maxWidth: 820, width: '100%' }}>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Verificações pendentes</h1>
          {msg && <div style={banner}>{msg}</div>}
          {loading ? <p>Carregando...</p> : total === 0 ? <p style={hint}>Nada pendente. 🎉</p> : null}

          {/* ───── LOJISTAS ───── */}
          {lojistas.length > 0 && <h2 style={h2}>Lojistas ({lojistas.length})</h2>}
          {lojistas.map((u) => (
            <div key={u._id} style={card}>
              <UserHead u={u} />
              <DocBlock u={u} approve={approve} reject={reject} />
              <FacialBlock u={u} approve={approve} reject={reject} />
              {u.stores.map((s) => (
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
                      <p style={hint}>{formatStoreAddress(s) || 'Endereço não informado'}</p>
                      <Imgs urls={[s.verification.address.comprovanteUrl]} labels={['Comprovante de endereço']} />
                      <Actions
                        onApprove={() => approve(`/verification/admin/store/${s._id}/address/approve`)}
                        onReject={() => reject(`/verification/admin/store/${s._id}/address/reject`)}
                      />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          ))}

          {/* ───── MOTOBOYS ───── */}
          {motoboyUsers.length > 0 && <h2 style={h2}>Motoboys ({motoboyUsers.length})</h2>}
          {motoboyUsers.map((u) => (
            <div key={u._id} style={card}>
              <UserHead u={u} />
              <DocBlock u={u} approve={approve} reject={reject} />
              <FacialBlock u={u} approve={approve} reject={reject} />
              {u.courier && (
                <div style={sub}>
                  <p style={subLabel}>🏍️ CNH e placa</p>
                  <p style={hint}>CNH: {u.courier.cnhNumber || '-'} · Placa: {u.courier.plate || '-'}</p>
                  <Imgs urls={[u.courier.cnhPhotoUrl, u.courier.platePhotoUrl]} labels={['Foto da CNH', 'Foto da placa']} />
                  <Actions
                    onApprove={() => approve(`/verification/admin/motoboy/${u._id}/approve`)}
                    onReject={() => reject(`/verification/admin/motoboy/${u._id}/reject`)}
                  />
                </div>
              )}
            </div>
          ))}

          {/* ───── CLIENTES ───── */}
          {clientes.length > 0 && <h2 style={h2}>Clientes ({clientes.length})</h2>}
          {clientes.map((u) => (
            <div key={u._id} style={card}>
              <UserHead u={u} />
              <DocBlock u={u} approve={approve} reject={reject} />
            </div>
          ))}
        </div>
      </div>
    </ProtectedRoute>
  );
}

// Monta o endereço estruturado da loja para o admin conferir contra o comprovante.
function formatStoreAddress(s: any): string {
  const linha1 = [s.street, s.number].filter(Boolean).join(', ');
  const linha2 = [s.neighborhood, s.city, s.state].filter(Boolean).join(' · ');
  const cep = s.zip ? `CEP ${s.zip}` : '';
  return [linha1, linha2, cep].filter(Boolean).join(' — ') || (s.address || '');
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

function UserHead({ u }: { u: AggUser }) {
  const storeNames = (u.stores || []).map((s) => s.name).filter(Boolean);
  return (
    <div style={{ marginBottom: 4 }}>
      {storeNames.length > 0 && <span style={storeTag}>🏪 {storeNames.join(' · ')}</span>}
      <div style={{ marginTop: storeNames.length ? 6 : 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{u.name || 'Usuário'}</strong>
        <TypeBadge user={u} />
        {u.email && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{u.email}</span>}
      </div>
    </div>
  );
}

function DocBlock({ u, approve, reject }: { u: AggUser; approve: (url: string) => void; reject: (url: string) => void }) {
  if (!u.doc || u.doc.status !== 'pending') return null;
  return (
    <div style={sub}>
      <p style={subLabel}>📄 Documento</p>
      <p style={hint}>Tipo: {u.doc.type?.toUpperCase()} · Nº {u.doc.number || '-'}</p>
      <Imgs urls={[u.doc.frontUrl, u.doc.backUrl]} labels={['Frente', 'Verso']} />
      <Actions
        onApprove={() => approve(`/verification/admin/${u._id}/approve`)}
        onReject={() => reject(`/verification/admin/${u._id}/reject`)}
      />
    </div>
  );
}

function FacialBlock({ u, approve, reject }: { u: AggUser; approve: (url: string) => void; reject: (url: string) => void }) {
  if (!u.facial || u.facial.status !== 'pending') return null;
  return (
    <div style={sub}>
      <p style={subLabel}>🤳 Facial / selfie (comparar com o documento)</p>
      <Imgs urls={[u.facial.selfieUrl]} labels={['Selfie']} />
      <Actions
        onApprove={() => approve(`/verification/admin/facial/${u._id}/approve`)}
        onReject={() => reject(`/verification/admin/facial/${u._id}/reject`)}
      />
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
const storeTag: React.CSSProperties = { display: 'inline-block', background: 'rgba(108,43,217,0.15)', border: '1px solid #6C2BD9', borderRadius: 8, padding: '2px 10px', fontSize: 12, fontWeight: 600, color: '#C4B5FD' };
const h2: React.CSSProperties = { fontFamily: 'Space Grotesk, sans-serif', marginTop: 28, fontSize: 18 };
const banner: React.CSSProperties = { background: 'rgba(108,43,217,0.15)', border: '1px solid #6C2BD9', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 };
const hint: React.CSSProperties = { color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '4px 0' };
const btn: React.CSSProperties = { color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' };
