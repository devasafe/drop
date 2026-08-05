import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { maskCPF, maskCNPJ, maskPhone, maskCEP } from '../lib/masks';
import OnboardingProgress from '../components/OnboardingProgress';
import OnboardingFooter from '../components/OnboardingFooter';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import styles from './DadosRecebimento.module.css';

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
  { value: '', label: 'Detectar automaticamente' },
  { value: 'CPF', label: 'CPF' },
  { value: 'CNPJ', label: 'CNPJ' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'PHONE', label: 'Telefone' },
  { value: 'EVP', label: 'Chave aleatória' },
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

  if (loading || authLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <p className={styles.loadingText}>Carregando...</p>
        </div>
      </div>
    );
  }
  if (!isReceiver) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <p className={styles.errorText}>Esta página é para lojistas e motoboys.</p>
        </div>
      </div>
    );
  }

  const active = status?.accountStatus === 'active';
  const needsAddress = !!status && !status.hasAddress;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <OnboardingProgress />

        <h1 className={styles.pageTitle}>Dados de recebimento</h1>
        <p className={styles.pageSubtitle}>
          Configure sua chave PIX (e endereço) para receber seus pagamentos e poder sacar.
        </p>

        {active && (
          <div className={`${styles.banner} ${styles.bannerSuccess}`}>
            <CheckCircle2 size={16} aria-hidden="true" />
            <div className={styles.bannerBody}>
              Conta de recebimento <strong>ativa</strong>. Chave PIX: {status?.pixKey}
            </div>
          </div>
        )}

        {/* Subconta com problema: avisa e deixa reenviar (não dá pra sacar assim) */}
        {!active && status?.accountStatus === 'error' && (
          <div className={`${styles.banner} ${styles.bannerError}`}>
            <AlertTriangle size={16} aria-hidden="true" />
            <div className={styles.bannerBody}>
              Sua conta de recebimento <strong>não está ativa</strong>
              {status?.lastError ? `: ${status.lastError}` : '.'} Você não conseguirá sacar até ativá-la.
              <div className={styles.bannerAction}>
                <Button variant="primary" size="sm" onClick={() => { setEditing(true); setMsg(null); }}>
                  Revisar dados e tentar novamente
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Subconta em processamento */}
        {!active && status?.accountStatus === 'pending' && (
          <div className={`${styles.banner} ${styles.bannerWarning}`}>
            <Clock size={16} aria-hidden="true" />
            <div className={styles.bannerBody}>
              Conta de recebimento <strong>em processamento</strong>. Aguarde a ativação para sacar.
            </div>
          </div>
        )}

        {msg && (
          <div className={`${styles.banner} ${msg.type === 'ok' ? styles.bannerSuccess : styles.bannerError}`}>
            <div className={styles.bannerBody}>{msg.text}</div>
          </div>
        )}

        <section className={styles.section}>
          {status?.hasPixKey && !editing ? (
            <>
              <label className={styles.fieldLabel}>Chave PIX cadastrada</label>
              <div className={styles.numberField}>
                <Input value={status.pixKey || '••••••'} onChange={() => {}} disabled aria-label="Chave PIX cadastrada" />
              </div>
              <Button variant="primary" onClick={() => setEditing(true)} className={styles.submitBtn}>
                Alterar chave PIX
              </Button>
            </>
          ) : (
            <form onSubmit={submit}>
              <label className={styles.fieldLabel}>Tipo da chave</label>
              <div className={styles.fieldGroup}>
                <Select
                  value={pixKeyType}
                  onChange={(v) => { setPixKeyType(v); setPixKey(maskPix(pixKey, v)); }}
                  options={PIX_TYPES}
                />
              </div>

              <label className={styles.fieldLabel}>Chave PIX (para onde seu dinheiro vai)</label>
              <div className={styles.fieldGroup}>
                <Input
                  value={pixKey}
                  onChange={(v) => setPixKey(maskPix(v, pixKeyType))}
                  maxLength={80}
                  placeholder="CPF, e-mail, telefone ou chave aleatória"
                />
              </div>
              <p className={styles.hintSmall}>Escolha o tipo acima para validar o formato da chave.</p>

              {needsAddress && (
                <>
                  <p className={styles.addressWarning}>Endereço (obrigatório para o recebimento)</p>
                  <div className={styles.fieldGroup}>
                    <Input value={addr.street} onChange={(v) => setAddr({ ...addr, street: v })} placeholder="Rua" maxLength={120} />
                  </div>
                  <div className={styles.row}>
                    <Input value={addr.number} onChange={(v) => setAddr({ ...addr, number: v })} placeholder="Número" maxLength={10} />
                    <Input
                      value={addr.zip}
                      onChange={(v) => setAddr({ ...addr, zip: maskCEP(v) })}
                      placeholder="CEP"
                      maxLength={9}
                      inputMode="numeric"
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <Input value={addr.neighborhood} onChange={(v) => setAddr({ ...addr, neighborhood: v })} placeholder="Bairro" maxLength={80} />
                  </div>
                  <div className={styles.rowCityState}>
                    <Input value={addr.city} onChange={(v) => setAddr({ ...addr, city: v })} placeholder="Cidade" maxLength={80} />
                    <Input
                      value={addr.state}
                      onChange={(v) => setAddr({ ...addr, state: v.toUpperCase().replace(/[^A-Z]/g, '') })}
                      placeholder="UF"
                      maxLength={2}
                    />
                  </div>
                </>
              )}

              <Button type="submit" variant="primary" loading={saving} disabled={saving} className={styles.submitBtn}>
                {saving ? 'Salvando...' : active ? 'Atualizar dados' : 'Ativar recebimento'}
              </Button>
            </form>
          )}
        </section>
      </div>
      <OnboardingFooter />
    </div>
  );
}
