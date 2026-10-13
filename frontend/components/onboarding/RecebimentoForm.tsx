// Formulário de recebimento (chave Pix + endereço quando falta), compartilhado pela loja e pelo motoboy.
// Embutido em /seller/abrir (etapa "Recebimento") e usado por /dados-recebimento.
// Regras portadas sem mudança da tela antiga:
// - a chave cadastrada vem MASCARADA do servidor: só exibe; "Alterar" abre o campo vazio;
// - valor com `*` (a máscara) é recusado antes de qualquer chamada;
// - depois de salvar, relê /onboarding/status (a chave volta mascarada);
// - modo direto: POST /onboarding/pix-key só com a chave; custódia: POST /onboarding/receiver (+ endereço se faltar).
import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { maskCPF, maskCNPJ, maskPhone, maskCEP } from '../../lib/masks';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Skeleton } from '../ui/Skeleton';
import blocks from '../seller/ui/SellerBlocks.module.css';

// Aplica máscara na chave PIX conforme o tipo escolhido.
function maskPix(value: string, type: string): string {
  if (type === 'CPF') return maskCPF(value).slice(0, 14);
  if (type === 'CNPJ') return maskCNPJ(value).slice(0, 18);
  if (type === 'PHONE') return maskPhone(value).slice(0, 15);
  return value.slice(0, 80); // EMAIL / EVP / auto: texto livre, com teto
}

export type ReceiverStatus = {
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

interface Props {
  /** Modo direto (SaaS): só a chave Pix. */
  direct: boolean;
  /** Loja (mostra "Quanto e quando"); falso para o motoboy. */
  store: boolean;
  /** Chamado quando a chave ficou salva (o checklist relê as etapas). */
  onSaved?: () => void;
}

export function RecebimentoForm({ direct, store, onSaved }: Props) {
  const [status, setStatus] = useState<ReceiverStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pixKey, setPixKey] = useState('');
  const [pixKeyType, setPixKeyType] = useState('');
  const [addr, setAddr] = useState({ street: '', number: '', neighborhood: '', city: '', state: '', zip: '' });
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    // O campo editável começa vazio: salvar sem redigitar gravaria a máscara como chave.
    api.get('/onboarding/status')
      .then((r) => setStatus(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const reloadStatus = () => api.get('/onboarding/status').then((r) => setStatus(r.data)).catch(() => {});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pixKey.trim()) { setMsg({ type: 'err', text: 'Informe sua chave PIX.' }); return; }
    if (pixKey.includes('*')) {
      setMsg({ type: 'err', text: 'Digite a chave inteira. A chave mascarada não serve para salvar.' });
      return;
    }
    const needsAddress = !direct && status && !status.hasAddress;
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
      if (direct) {
        await api.post('/onboarding/pix-key', body);
        setPixKey('');
        setEditing(false);
        await reloadStatus();
        setMsg({ type: 'ok', text: 'Chave PIX salva. Os pagamentos caem direto na sua conta.' });
        onSaved?.();
        return;
      }
      if (needsAddress) body.address = addr;
      const res = await api.post('/onboarding/receiver', body);
      const a = res.data?.asaas;
      setStatus((s) => (s ? { ...s, accountStatus: a?.status, hasPixKey: a?.hasPix, hasAddress: true, lastError: a?.lastError } : s));
      if (a?.hasPix) { setEditing(false); setPixKey(''); } // colapsa pro modo "Alterar chave PIX"
      await reloadStatus(); // a chave volta mascarada do servidor
      if (a?.status === 'active') {
        setMsg({ type: 'ok', text: 'Conta de recebimento ativada! Você já pode receber e sacar.' });
      } else if (a?.status === 'error') {
        setMsg({ type: 'err', text: `Não foi possível ativar: ${a?.lastError || 'verifique os dados'}` });
      } else {
        setMsg({ type: 'ok', text: 'Dados salvos. A conta está sendo processada.' });
      }
      if (a?.hasPix && a?.status !== 'error') onSaved?.();
    } catch (err: any) {
      setMsg({ type: 'err', text: err?.response?.data?.error || 'Erro ao salvar.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton height={200} radius="var(--radius-lg)" />;

  const active = !direct && status?.accountStatus === 'active';
  const needsAddress = !direct && !!status && !status.hasAddress;

  return (
    <>
      {active && (
        <Alert tone="success" title="Conta de recebimento ativa">{`Chave PIX: ${status?.pixKey ?? ''}`}</Alert>
      )}
      {/* Subconta com problema: avisa e deixa reenviar (não dá pra sacar assim) */}
      {!direct && !active && status?.accountStatus === 'error' && (
        <Alert
          tone="error"
          title="Sua conta de recebimento não está ativa"
          action={{ label: 'Revisar dados e tentar novamente', onClick: () => { setEditing(true); setMsg(null); } }}
        >
          {`${status?.lastError ? `${status.lastError}. ` : ''}Você não conseguirá sacar até ativá-la.`}
        </Alert>
      )}
      {!direct && !active && status?.accountStatus === 'pending' && (
        <Alert tone="warning" title="Conta de recebimento em processamento">Aguarde a ativação para sacar.</Alert>
      )}
      {msg && <Alert tone={msg.type === 'ok' ? 'success' : 'error'}>{msg.text}</Alert>}

      <section className={blocks.blk} aria-label="Chave Pix">
        <h3 className={blocks.headTitle}>{store ? 'Chave Pix da loja' : 'Chave Pix'}</h3>
        {status?.hasPixKey && !editing ? (
          <>
            <Input label="Chave PIX cadastrada" value={status.pixKey || '••••••'} onChange={() => {}} disabled aria-label="Chave PIX cadastrada" />
            <Button variant="secondary" onClick={() => { setPixKey(''); setPixKeyType(''); setEditing(true); }}>
              Alterar chave PIX
            </Button>
          </>
        ) : (
          <form onSubmit={submit} className={blocks.stack} noValidate>
            <p className={blocks.sub}>
              {store ? 'O DROP guarda o dinheiro até a liberação e manda para a sua chave.' : 'É para onde vai o dinheiro das suas entregas.'}
            </p>
            <Input
              label="Chave PIX (para onde seu dinheiro vai)"
              value={pixKey}
              onChange={(v) => setPixKey(maskPix(v, pixKeyType))}
              maxLength={80}
              placeholder="CPF, e-mail, telefone ou chave aleatória"
            />
            <Select
              label="Tipo da chave"
              value={pixKeyType}
              onChange={(v) => { setPixKeyType(v); setPixKey(maskPix(pixKey, v)); }}
              options={PIX_TYPES}
              hint="Escolha o tipo para validar o formato da chave."
            />

            {needsAddress && (
              <>
                <p className={blocks.cap}>Endereço (obrigatório para o recebimento)</p>
                <Input label="Rua" value={addr.street} onChange={(v) => setAddr({ ...addr, street: v })} maxLength={120} />
                <Input label="Número" value={addr.number} onChange={(v) => setAddr({ ...addr, number: v })} maxLength={10} />
                <Input label="CEP" value={addr.zip} onChange={(v) => setAddr({ ...addr, zip: maskCEP(v) })} maxLength={9} inputMode="numeric" />
                <Input label="Bairro" value={addr.neighborhood} onChange={(v) => setAddr({ ...addr, neighborhood: v })} maxLength={80} />
                <Input label="Cidade" value={addr.city} onChange={(v) => setAddr({ ...addr, city: v })} maxLength={80} />
                <Input label="UF" value={addr.state} onChange={(v) => setAddr({ ...addr, state: v.toUpperCase().replace(/[^A-Z]/g, '') })} maxLength={2} />
              </>
            )}

            <Button type="submit" loading={saving} disabled={saving}>
              {saving ? 'Salvando...' : direct ? 'Salvar chave PIX' : active ? 'Atualizar dados' : 'Ativar recebimento'}
            </Button>
          </form>
        )}
      </section>

      {store && !direct && (
        <Alert tone="info" title="Quanto e quando">
          Cada venda entregue vira saldo, já sem a comissão do seu plano. O valor libera depois que o cliente recebe o pedido, e você saca para esta chave.
        </Alert>
      )}
    </>
  );
}

export default RecebimentoForm;
