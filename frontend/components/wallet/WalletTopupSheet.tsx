import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import api from '../../lib/api';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useToast } from '../ui/Toast';
import { formatBRL } from '../ui/PriceTag';
import { CardForm, CardPayload } from '../drop/checkout/CardForm';
import styles from './WalletTopupSheet.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  onPaid: () => void;
  holderDefaults?: { name?: string; cpfCnpj?: string; email?: string; phone?: string; postalCode?: string; addressNumber?: string };
}

type Method = 'pix' | 'credit_card' | 'debit_card';
type Step = 'form' | 'pix' | 'done';

const parse = (s: string) => { const n = Number(String(s).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

export default function WalletTopupSheet({ open, onClose, userId, onPaid, holderDefaults }: Props) {
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>('form');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('pix');
  const [cardPayload, setCardPayload] = useState<CardPayload & { valid?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pix, setPix] = useState<{ topupId: string; qrCodeImage?: string; qrCodePayload?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<any>(null);

  useEffect(() => { if (open) { setStep('form'); setAmount(''); setMethod('pix'); setPix(null); } }, [open]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const value = parse(amount);
  const validAmount = Number.isFinite(value) && value > 0;

  const startPixPolling = (topupId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await api.get(`/wallets/topup/${topupId}/status`);
        if (r.data?.status === 'paid') {
          clearInterval(pollRef.current);
          setStep('done');
          onPaid();
        }
      } catch { /* segue tentando */ }
    }, 3000);
  };

  const submit = async () => {
    if (!validAmount) { showToast('Informe um valor válido.', 'error'); return; }
    setBusy(true);
    try {
      const body: any = { amount: value, method };
      if (method !== 'pix') {
        if (!cardPayload?.valid) { showToast('Preencha os dados do cartão.', 'error'); setBusy(false); return; }
        body.card = cardPayload.card;
        body.holder = cardPayload.cardHolder;
      }
      const res = await api.post(`/wallets/${userId}/topup`, body);
      const d = res.data;
      if (method === 'pix') {
        setPix({ topupId: d.topupId, qrCodeImage: d.pix?.qrCodeImage, qrCodePayload: d.pix?.qrCodePayload });
        setStep('pix');
        startPixPolling(d.topupId);
      } else {
        if (d.paid) { setStep('done'); onPaid(); }
        else showToast('Pagamento em processamento. O saldo entra assim que confirmar.', 'info');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Não foi possível iniciar a recarga.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!pix?.qrCodePayload) return;
    try { await navigator.clipboard.writeText(pix.qrCodePayload); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* http */ }
  };

  const title = step === 'done' ? 'Recarga confirmada' : step === 'pix' ? 'Pague com PIX' : 'Carregar saldo';

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {step === 'done' ? (
        <div className={styles.done}>
          <Check size={40} aria-hidden="true" />
          <p>Saldo adicionado à sua carteira!</p>
          <Button onClick={onClose}>Fechar</Button>
        </div>
      ) : step === 'pix' && pix ? (
        <div className={styles.pixBody}>
          <p className={styles.hint}>Escaneie o QR Code ou copie o código. A confirmação é automática.</p>
          {pix.qrCodeImage && <img className={styles.qr} src={`data:image/png;base64,${pix.qrCodeImage}`} alt="QR Code PIX" />}
          {pix.qrCodePayload && (
            <>
              <div className={styles.code}>{pix.qrCodePayload}</div>
              <button type="button" className={styles.copyBtn} onClick={copy}>
                {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copiado!' : 'Copiar código'}
              </button>
            </>
          )}
          {!pix.qrCodeImage && !pix.qrCodePayload && <div className={styles.waiting}>Gerando o QR Code…</div>}
          <div className={styles.waiting}>Aguardando pagamento…</div>
        </div>
      ) : (
        <div className={styles.form}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Valor</span>
            <div className={styles.amountWrap}>
              <span className={styles.currency}>R$</span>
              <input className={styles.amountInput} inputMode="decimal" value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0,00" autoFocus />
            </div>
          </label>

          <span className={styles.fieldLabel}>Forma de pagamento</span>
          <div className={styles.methods}>
            {([['pix', 'PIX'], ['credit_card', 'Crédito'], ['debit_card', 'Débito']] as [Method, string][]).map(([m, label]) => (
              <button key={m} type="button" className={`${styles.methodChip} ${method === m ? styles.methodActive : ''}`} onClick={() => setMethod(m)}>
                {label}
              </button>
            ))}
          </div>

          {method !== 'pix' && (
            <div className={styles.cardWrap}>
              <CardForm
                holderDefaults={{ name: holderDefaults?.name || '', cpfCnpj: holderDefaults?.cpfCnpj || '', email: holderDefaults?.email || '', phone: holderDefaults?.phone || '', postalCode: holderDefaults?.postalCode || '', addressNumber: holderDefaults?.addressNumber || '' }}
                onChange={(p) => setCardPayload(p as any)}
              />
            </div>
          )}

          <Button onClick={submit} disabled={!validAmount || busy}>
            {busy ? 'Processando…' : `Carregar ${validAmount ? formatBRL(value) : ''}`.trim()}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
