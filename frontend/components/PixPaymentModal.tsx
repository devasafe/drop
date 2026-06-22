import { useEffect, useState, useRef } from 'react';
import api from '../lib/api';
import Icon from './Icon';

interface PixInfo {
  qrCodeImage?: string;   // base64 (sem prefixo data:)
  qrCodePayload?: string; // copia-e-cola
  expiresAt?: string;
  orderId: string;
}

interface Props {
  pix: PixInfo;
  onPaid?: (orderId: string) => void;
}

/**
 * Modal de pagamento PIX: mostra QR + copia-e-cola e fica consultando o pedido
 * até o backend confirmar (paymentStatus='paid' via webhook do Asaas).
 */
export default function PixPaymentModal({ pix, onPaid }: Props) {
  const [status, setStatus] = useState<'waiting' | 'paid'>('waiting');
  const [copied, setCopied] = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => {
    const check = async () => {
      try {
        // /pix reconcilia direto com o Asaas (não depende do webhook chegar).
        const res = await api.get(`/orders/${pix.orderId}/pix`);
        if (res.data?.paid === true) {
          setStatus('paid');
          if (timer.current) clearInterval(timer.current);
          setTimeout(() => {
            if (onPaid) onPaid(pix.orderId);
            else window.location.href = `/store-order/${pix.orderId}`;
          }, 1800);
        }
      } catch {
        /* segue tentando */
      }
    };
    timer.current = setInterval(check, 4000);
    check();
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [pix.orderId, onPaid]);

  const copy = async () => {
    if (!pix.qrCodePayload) return;
    try {
      await navigator.clipboard.writeText(pix.qrCodePayload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard pode falhar em http — ignora */
    }
  };

  return (
    <div style={overlay}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={card}>
        {status === 'paid' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
            <h2 style={title}>Pagamento confirmado!</h2>
            <p style={hint}>Redirecionando para o seu pedido…</p>
          </div>
        ) : (
          <>
            <h2 style={title}>Pague com PIX</h2>
            <p style={hint}>Escaneie o QR Code ou copie o código. A confirmação é automática.</p>

            {pix.qrCodeImage && (
              <div style={{ textAlign: 'center', margin: '16px 0' }}>
                <img
                  src={`data:image/png;base64,${pix.qrCodeImage}`}
                  alt="QR Code PIX"
                  style={{ width: 220, height: 220, background: '#fff', borderRadius: 12, padding: 8 }}
                />
              </div>
            )}

            {pix.qrCodePayload && (
              <>
                <div style={codeBox}>{pix.qrCodePayload}</div>
                <button style={btn} onClick={copy}>
                  <Icon name={copied ? 'check' : 'file-text'} size={16} /> {copied ? 'Copiado!' : 'Copiar código'}
                </button>
              </>
            )}

            <div style={waiting}>
              <span style={spinner} /> Aguardando pagamento…
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 };
const card: React.CSSProperties = { background: '#161616', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380, color: 'rgba(255,255,255,0.92)' };
const title: React.CSSProperties = { fontFamily: 'Space Grotesk, sans-serif', margin: '0 0 6px', fontSize: 20 };
const hint: React.CSSProperties = { color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: 0 };
const codeBox: React.CSSProperties = { background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 12, fontSize: 11, wordBreak: 'break-all', maxHeight: 90, overflow: 'auto', marginBottom: 10 };
const btn: React.CSSProperties = { width: '100%', background: '#6C2BD9', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 };
const waiting: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, color: 'rgba(255,255,255,0.6)', fontSize: 13 };
const spinner: React.CSSProperties = { width: 14, height: 14, border: '2px solid rgba(255,255,255,0.25)', borderTopColor: '#8B5CF6', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' };
