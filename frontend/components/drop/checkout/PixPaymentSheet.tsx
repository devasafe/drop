import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import api from '../../../lib/api';
import { Sheet } from '../../ui/Sheet';
import { ICON_STROKE_WIDTH } from '../../ui/Icon';
import type { PixInfo } from '../../../types/checkout';
import styles from './PixPaymentSheet.module.css';

export interface PixPaymentSheetProps {
  pix: PixInfo;
  onPaid: (orderId: string) => void;
  onClose: () => void;
}

const POLL_INTERVAL_MS = 4000;
const REDIRECT_DELAY_MS = 1800;
const COPY_FEEDBACK_MS = 2000;

/**
 * Sheet de pagamento PIX: QR + copia-e-cola, consultando `/orders/:id/pix`
 * a cada 4s até o backend confirmar (paymentStatus='paid' via webhook do
 * Asaas — o endpoint reconcilia direto com o Asaas, não depende só do
 * webhook chegar). Redesign de `PixPaymentModal` no DS (Sheet + CSS Modules
 * + tokens), sem alterar a lógica de polling.
 */
export function PixPaymentSheet({ pix, onPaid, onClose }: PixPaymentSheetProps) {
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);
  // O QR pode vir vazio da criação do pedido (Asaas às vezes demora a gerar).
  // O poll de /orders/:id/pix também devolve o QR — usamos como fallback.
  const [qrImage, setQrImage] = useState<string | undefined>(pix.qrCodeImage);
  const [qrPayload, setQrPayload] = useState<string | undefined>(pix.qrCodePayload);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await api.get<{ paid: boolean; qrCodeImage?: string; qrCodePayload?: string }>(`/orders/${pix.orderId}/pix`);
        if (res.data?.paid === true) {
          setPaid(true);
          if (timer.current) clearInterval(timer.current);
          setTimeout(() => onPaid(pix.orderId), REDIRECT_DELAY_MS);
          return;
        }
        if (res.data?.qrCodeImage) setQrImage(res.data.qrCodeImage);
        if (res.data?.qrCodePayload) setQrPayload(res.data.qrCodePayload);
      } catch {
        /* segue tentando */
      }
    };
    timer.current = setInterval(check, POLL_INTERVAL_MS);
    check();
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [pix.orderId, onPaid]);

  const copy = async () => {
    if (!qrPayload) return;
    try {
      await navigator.clipboard.writeText(qrPayload);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      /* clipboard pode falhar em http — ignora */
    }
  };

  return (
    <Sheet open onClose={onClose} title={paid ? 'Pagamento confirmado' : 'Pague com PIX'}>
      {paid ? (
        <div className={styles.paid}>
          <Check size={40} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
          <p>Redirecionando para o seu pedido…</p>
        </div>
      ) : (
        <div className={styles.body}>
          <p className={styles.hint}>Escaneie o QR Code ou copie o código. A confirmação é automática.</p>
          {!qrImage && !qrPayload && (
            <div className={styles.waiting}>Gerando o QR Code…</div>
          )}
          {qrImage && (
            <img className={styles.qr} src={`data:image/png;base64,${qrImage}`} alt="QR Code PIX" />
          )}
          {qrPayload && (
            <>
              <div className={styles.code}>{qrPayload}</div>
              <button type="button" className={styles.copyBtn} onClick={copy}>
                {copied ? (
                  <Check size={16} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
                ) : (
                  <Copy size={16} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
                )}
                {copied ? 'Copiado!' : 'Copiar código'}
              </button>
            </>
          )}
          <div className={styles.waiting}>Aguardando pagamento…</div>
        </div>
      )}
    </Sheet>
  );
}
