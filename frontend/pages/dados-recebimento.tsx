import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import Icon from '../components/Icon';
import { maskCPF, maskCNPJ, maskPhone, maskCEP } from '../lib/masks';
import OnboardingProgress from '../components/OnboardingProgress';
import OnboardingFooter from '../components/OnboardingFooter';

// Aplica máscara na chave PIX conforme o tipo escolhido.
function maskPix(value: string, type: string): string {
  if (type === 'CPF') return maskCPF(value).slice(0, 14);
  if (type === 'CNPJ') return maskCNPJ(value).slice(0, 18);
  if (type === 'PHONE') return maskPhone(value).slice(0, 15);
  return value.slice(0, 80); // EMAIL / EVP / auto: texto livre, com teto
}

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
  const [editing, setEditing] = useState(false);

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
      // CPF/CNPJ/telefone vão como dígitos limpos (o Asaas não aceita máscara).
      const cleanPix = ['CPF', 'CNPJ', 'PHONE'].includes(pixKeyType) ? pixKey.replace(/\D/g, '') : pixKey.trim();
      const body: any = { pixKey: cleanPix };
      if (pixKeyType) body.pixKeyType = pixKeyType;
      if (needsAddress) body.address = addr;
      const res = await api.post('/onboarding/receiver', body);
      const a = res.data?.asaas;
      setStatus((s) => (s ? { ...s, accountStatus: a?.status, hasPixKey: a?.hasPix, hasAddress: true, pixKey: pixKey, lastError: a?.lastError } : s));
      if (a?.hasPix) setEditing(false); // colapsa pro modo "Alterar chave PIX"
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
      <OnboardingProgress />
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

        {/* Subconta com problema: avisa e deixa reenviar (não dá pra sacar assim) */}
        {!active && status?.accountStatus === 'error' && (
          <div style={{ ...banner, borderColor: '#EF4444', background: 'rgba(239,68,68,0.12)' }}>
            <Icon name="alert-triangle" size={16} /> Sua conta de recebimento <b>não está ativa</b>
            {status?.lastError ? `: ${status.lastError}` : '.'} Você não conseguirá sacar até ativá-la.
            <button style={{ ...btn, marginTop: 10 }} onClick={() => { setEditing(true); setMsg(null); }}>
              Revisar dados e tentar novamente
            </button>
          </div>
        )}

        {/* Subconta em processamento */}
        {!active && status?.accountStatus === 'pending' && (
          <div style={{ ...banner, borderColor: '#F59E0B', background: 'rgba(245,158,11,0.12)' }}>
            <Icon name="clock" size={16} /> Conta de recebimento <b>em processamento</b>. Aguarde a ativação para sacar.
          </div>
        )}

        {msg && (
          <div style={{ ...banner, borderColor: msg.type === 'ok' ? '#22C55E' : '#EF4444', background: msg.type === 'ok' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)' }}>
            {msg.text}
          </div>
        )}

        {status?.hasPixKey && !editing ? (
          <div style={card}>
            <label style={label}>Chave PIX cadastrada</label>
            <div style={{ ...input, marginBottom: 12 }}>{status.pixKey || '••••••'}</div>
            <button style={btn} onClick={() => setEditing(true)}>Alterar chave PIX</button>
          </div>
        ) : (
        <form onSubmit={submit} style={card}>
          <label style={label}>Tipo da chave</label>
          <select style={input} value={pixKeyType} onChange={(e) => { setPixKeyType(e.target.value); setPixKey(maskPix(pixKey, e.target.value)); }}>
            {PIX_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>

          <label style={label}>Chave PIX (para onde seu dinheiro vai)</label>
          <input style={input} value={pixKey} onChange={(e) => setPixKey(maskPix(e.target.value, pixKeyType))} maxLength={80} placeholder="CPF, e-mail, telefone ou chave aleatória" />
          <p style={{ ...label, marginTop: 0, fontSize: 12 }}>Escolha o tipo acima para validar o formato da chave.</p>

          {status && !status.hasAddress && (
            <>
              <p style={{ ...label, marginTop: 16, color: '#F59E0B' }}>Endereço (obrigatório para o recebimento)</p>
              <input style={input} placeholder="Rua" maxLength={120} value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={input} placeholder="Número" maxLength={10} value={addr.number} onChange={(e) => setAddr({ ...addr, number: e.target.value })} />
                <input style={input} placeholder="CEP" maxLength={9} inputMode="numeric" value={addr.zip} onChange={(e) => setAddr({ ...addr, zip: maskCEP(e.target.value) })} />
              </div>
              <input style={input} placeholder="Bairro" maxLength={80} value={addr.neighborhood} onChange={(e) => setAddr({ ...addr, neighborhood: e.target.value })} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={input} placeholder="Cidade" maxLength={80} value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
                <input style={{ ...input, maxWidth: 90 }} placeholder="UF" maxLength={2} value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} />
              </div>
            </>
          )}

          <button type="submit" style={btn} disabled={saving}>
            {saving ? 'Salvando...' : active ? 'Atualizar dados' : 'Ativar recebimento'}
          </button>
        </form>
        )}
      </div>
      <OnboardingFooter />
    </div>
  );
}

const wrap: React.CSSProperties = { minHeight: '100vh', background: '#0A0A0A', color: 'rgba(255,255,255,0.92)', display: 'flex', justifyContent: 'center', padding: 24 };
const card: React.CSSProperties = { background: '#161616', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20, marginTop: 16 };
const banner: React.CSSProperties = { border: '1px solid', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 };
const label: React.CSSProperties = { color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', margin: '10px 0 6px' };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#0A0A0A', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 12px', marginBottom: 8 };
const btn: React.CSSProperties = { width: '100%', background: '#6C2BD9', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', fontWeight: 600, cursor: 'pointer', marginTop: 12 };
