import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import Icon from '../components/Icon';

type Status = {
  target: 'store' | 'motoboy' | 'none';
  accountStatus: 'none' | 'pending' | 'active' | 'error';
  hasPixKey: boolean;
  hasAddress: boolean;
  pixKey?: string;
  lastError?: string;
};

const PIX_TYPES = [
  { v: '', label: 'Detectar automaticamente' },
  { v: 'CPF', label: 'CPF' },
  { v: 'CNPJ', label: 'CNPJ' },
  { v: 'EMAIL', label: 'E-mail' },
  { v: 'PHONE', label: 'Telefone' },
  { v: 'EVP', label: 'Chave aleatória' },
];

export default function DadosRecebimento() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth() || ({} as any);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [pixKey, setPixKey] = useState('');
  const [pixKeyType, setPixKeyType] = useState('');
  const [addr, setAddr] = useState({ street: '', number: '', neighborhood: '', city: '', state: '', zip: '' });

  const role = user?.activeRole || user?.role;
  const isReceiver = role === 'motoboy' || role === 'lojista' || role === 'seller';

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (!isReceiver) { setLoading(false); return; }
    api.get('/onboarding/status')
      .then((r) => { setStatus(r.data); if (r.data?.pixKey) setPixKey(r.data.pixKey); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authLoading, user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pixKey.trim()) { setMsg({ type: 'err', text: 'Informe sua chave PIX.' }); return; }
    const needsAddress = status && !status.hasAddress;
    if (needsAddress && (!addr.street || !addr.number || !addr.zip)) {
      setMsg({ type: 'err', text: 'Preencha o endereço (rua, número e CEP).' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const body: any = { pixKey: pixKey.trim() };
      if (pixKeyType) body.pixKeyType = pixKeyType;
      if (needsAddress) body.address = addr;
      const res = await api.post('/onboarding/receiver', body);
      const a = res.data?.asaas;
      setStatus((s) => (s ? { ...s, accountStatus: a?.status, hasPixKey: a?.hasPix, hasAddress: true, lastError: a?.lastError } : s));
      if (a?.status === 'active') {
        setMsg({ type: 'ok', text: 'Conta de recebimento ativada! Você já pode receber e sacar.' });
      } else if (a?.status === 'error') {
        setMsg({ type: 'err', text: `Não foi possível ativar: ${a?.lastError || 'verifique os dados'}` });
      } else {
        setMsg({ type: 'ok', text: 'Dados salvos. A conta está sendo processada.' });
      }
    } catch (err: any) {
      setMsg({ type: 'err', text: err?.response?.data?.error || 'Erro ao salvar.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading || authLoading) return <div style={wrap}><p>Carregando...</p></div>;
  if (!isReceiver) return <div style={wrap}><div style={card}><p>Esta página é para lojistas e motoboys.</p></div></div>;

  const active = status?.accountStatus === 'active';

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Dados de Recebimento</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)' }}>
          Configure sua chave PIX (e endereço) para receber seus pagamentos e poder sacar.
        </p>

        {active && (
          <div style={{ ...banner, borderColor: '#22C55E', background: 'rgba(34,197,94,0.12)' }}>
            <Icon name="check-circle" size={16} /> Conta de recebimento <b>ativa</b>. Chave PIX: {status?.pixKey}
          </div>
        )}

        {msg && (
          <div style={{ ...banner, borderColor: msg.type === 'ok' ? '#22C55E' : '#EF4444', background: msg.type === 'ok' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)' }}>
            {msg.text}
          </div>
        )}

        <form onSubmit={submit} style={card}>
          <label style={label}>Chave PIX (para onde seu dinheiro vai)</label>
          <input style={input} value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="CPF, e-mail, telefone ou chave aleatória" />

          <label style={label}>Tipo da chave</label>
          <select style={input} value={pixKeyType} onChange={(e) => setPixKeyType(e.target.value)}>
            {PIX_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>

          {status && !status.hasAddress && (
            <>
              <p style={{ ...label, marginTop: 16, color: '#F59E0B' }}>Endereço (obrigatório para o recebimento)</p>
              <input style={input} placeholder="Rua" value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={input} placeholder="Número" value={addr.number} onChange={(e) => setAddr({ ...addr, number: e.target.value })} />
                <input style={input} placeholder="CEP" value={addr.zip} onChange={(e) => setAddr({ ...addr, zip: e.target.value })} />
              </div>
              <input style={input} placeholder="Bairro" value={addr.neighborhood} onChange={(e) => setAddr({ ...addr, neighborhood: e.target.value })} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={input} placeholder="Cidade" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
                <input style={{ ...input, maxWidth: 90 }} placeholder="UF" maxLength={2} value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value.toUpperCase() })} />
              </div>
            </>
          )}

          <button type="submit" style={btn} disabled={saving}>
            {saving ? 'Salvando...' : active ? 'Atualizar dados' : 'Ativar recebimento'}
          </button>
        </form>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = { minHeight: '100vh', background: '#0A0A0A', color: 'rgba(255,255,255,0.92)', display: 'flex', justifyContent: 'center', padding: 24 };
const card: React.CSSProperties = { background: '#161616', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20, marginTop: 16 };
const banner: React.CSSProperties = { border: '1px solid', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 };
const label: React.CSSProperties = { color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', margin: '10px 0 6px' };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#0A0A0A', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 12px', marginBottom: 8 };
const btn: React.CSSProperties = { width: '100%', background: '#6C2BD9', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', fontWeight: 600, cursor: 'pointer', marginTop: 12 };
