import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import api from '../../../lib/api';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../../lib/money';
import { ICON_STROKE_WIDTH } from '../../ui/Icon';
import type { PixInfo } from '../../../types/checkout';
import styles from './PixPaymentSheet.module.css';

export interface PixPaymentSheetProps {
  pix: PixInfo;
  /** Provedor do pedido (`Order.paymentProvider`). 'asaas_loja' = pedido direto, na conta da loja. */
  paymentProvider?: string | null;
  /** Nome do recebedor (a loja) para o aviso do Pix direto. */
  recipientName?: string | null;
  /** Valor a pagar no Pix (já com cupom e saldo). */
  amount?: number;
  storeName?: string;
  onPaid: (orderId: string) => void;
  onClose: () => void;
}

const POLL_INTERVAL_MS = 4000;
const REDIRECT_DELAY_MS = 1800;
const COPY_FEEDBACK_MS = 2000;
// Nº de tentativas de poll sem conseguir o QR antes de desistir e mostrar erro.
// Sem isto, quando o Asaas não devolve o QR (ex: conta-mãe sem chave PIX, timeout),
// o sheet gira em "Gerando o QR Code…" pra sempre. 5 × 4s ≈ 20s de tolerância.
const MAX_QR_ATTEMPTS = 5;

/**
 * Sheet de pagamento PIX: QR + copia-e-cola, consultando `/orders/:id/pix`
 * a cada 4s até o backend confirmar (paymentStatus='paid' via webhook do
 * Asaas — o endpoint reconcilia direto com o Asaas, não depende só do
 * webhook chegar). Redesign de `PixPaymentModal` no DS (Sheet + CSS Modules
 * + tokens), sem alterar a lógica de polling.
 */
export function PixPaymentSheet({ pix, paymentProvider, recipientName, amount, onPaid, onClose }: PixPaymentSheetProps) {
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);
  // O QR pode vir vazio da criação do pedido (Asaas às vezes demora a gerar).
  // O poll de /orders/:id/pix também devolve o QR — usamos como fallback.
  const [qrImage, setQrImage] = useState<string | undefined>(pix.qrCodeImage);
  const [qrPayload, setQrPayload] = useState<string | undefined>(pix.qrCodePayload);
  // Vira true quando esgotamos as tentativas de obter o QR — troca o "Gerando o
  // QR Code…" eterno por uma saída acionável.
  const [qrFailed, setQrFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Refs (não state) pra sobreviver ao closure do setInterval, que captura os
  // valores do 1º render: `gotQr` marca se o QR já chegou algum dia; `attempts`
  // conta os polls sem QR.
  const gotQr = useRef<boolean>(!!(pix.qrCodeImage || pix.qrCodePayload));
  const attempts = useRef<number>(0);

  // Contagem regressiva da expiração pelo relógio do SERVIDOR: `serverNow` (criação do pedido)
  // dá a diferença para o relógio do aparelho, que pode estar adiantado ou atrasado.
  const skew = useRef<number>((() => {
    const s = pix.serverNow ? Date.parse(pix.serverNow) : NaN;
    return Number.isFinite(s) ? Date.now() - s : 0;
  })());
  const serverClock = () => Date.now() - skew.current;
  const [now, setNow] = useState(serverClock);
  const expiresAt = pix.expiresAt ? Date.parse(pix.expiresAt) : NaN;
  const remaining = Number.isFinite(expiresAt) ? Math.max(0, expiresAt - now) : null;
  const expired = remaining === 0;
  useEffect(() => {
    if (!Number.isFinite(expiresAt) || paid) return;
    const t = setInterval(() => setNow(serverClock()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt, paid]);
  // Fim do prazo: consulta o status na hora (o pagamento pode ter entrado no último minuto) e NÃO
  // para o polling — quem decide se foi pago é o servidor; um pagamento tardio ainda é confirmado.
  const checkRef = useRef<(() => void) | null>(null);
  useEffect(() => { if (expired) checkRef.current?.(); }, [expired]);
  const mmss = remaining == null ? null : `${String(Math.floor(remaining / 60000)).padStart(2, '0')}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}`;

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
        if (res.data?.qrCodeImage) { setQrImage(res.data.qrCodeImage); gotQr.current = true; }
        if (res.data?.qrCodePayload) { setQrPayload(res.data.qrCodePayload); gotQr.current = true; }
      } catch {
        /* segue tentando (erro/timeout ainda conta como tentativa abaixo) */
      }
      // Enquanto não temos QR, conta a tentativa. Estourou o limite → desiste do
      // poll e mostra erro. Se o QR já veio, nunca falha (segue só verificando pgto).
      if (!gotQr.current) {
        attempts.current += 1;
        if (attempts.current >= MAX_QR_ATTEMPTS) {
          if (timer.current) clearInterval(timer.current);
          setQrFailed(true);
        }
      }
    };
    checkRef.current = check;
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

  const title = paid ? 'Pagamento confirmado' : qrFailed ? 'Não foi possível gerar o Pix' : expired ? 'O Pix expirou' : 'Pague com Pix';

  return (
    <Sheet open onClose={onClose} title={title} presentation="bottom">
      {paid ? (
        <div className={styles.paid}>
          <Check size={40} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
          <p>Avisamos a loja. Abrindo o seu pedido…</p>
        </div>
      ) : expired ? (
        <div className={styles.body}>
          <p className={styles.hint}>O Pix expirou, nada foi cobrado.</p>
          <p className={styles.hint} aria-live="polite">Pagou antes de expirar? Seguimos conferindo e confirmamos em instantes.</p>
          <Button onClick={onClose}>Ver pedido</Button>
        </div>
      ) : qrFailed ? (
        <div className={styles.body}>
          <p className={styles.hint}>
            Não conseguimos gerar o código Pix para este pedido agora. Seu pedido
            foi criado — você pode tentar pagar de novo na tela do pedido.
          </p>
          <Button onClick={() => onPaid(pix.orderId)}>Ver pedido e pagar</Button>
        </div>
      ) : (
        <div className={styles.body}>
          {amount != null && <p className={styles.amount}>{formatMoney(amount)}</p>}
          {mmss && <p className={[styles.expires, remaining! < 5 * 60 * 1000 && styles.urgent].filter(Boolean).join(' ')}>{`Expira em ${mmss}`}</p>}
          {qrPayload && (
            <Button onClick={copy} leftIcon={copied ? <Check size={16} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" /> : <Copy size={16} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}>
              {copied ? 'Código copiado' : 'Copiar código Pix'}
            </Button>
          )}
          {!qrImage && !qrPayload && (
            <div className={styles.waiting}>Gerando o QR Code…</div>
          )}
          {qrImage && (
            <div className={styles.qrBox}>
              <img className={styles.qr} src={`data:image/png;base64,${qrImage}`} alt="QR Code PIX" />
            </div>
          )}
          {qrPayload && <div className={styles.code}>{qrPayload}</div>}
          <ol className={styles.steps}>
            <li>Abra o app do seu banco e escolha Pix</li>
            <li>Cole o código ou escaneie o QR</li>
            <li>Pronto: a loja recebe o pedido na hora</li>
          </ol>
          {paymentProvider === 'asaas_loja' && (
            <>
              <p className={styles.hint}>No app do banco vai aparecer o nome da loja — é ela recebendo, pelo Asaas dela.</p>
              <p className={styles.hint}>{`Pix processado pelo Asaas. Recebedor: ${recipientName || 'a loja'}`}</p>
            </>
          )}
          <div className={styles.waiting} aria-live="polite">Aguardando pagamento · Confirmamos sozinhos, pode trocar de app e voltar.</div>
        </div>
      )}
    </Sheet>
  );
}
