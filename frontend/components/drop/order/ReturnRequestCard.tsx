import { useState } from 'react';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { RadioRow } from '../../ui/RadioRow';
import { formatMoney } from '../../../lib/money';
import { refundChannel } from './CourierTimeoutCard';
import styles from './OrderDecision.module.css';

/** Pedido de reembolso como vem de GET /orders/:id/return-request (o PIN só para o cliente, devolvendo). */
export interface ReturnRequestView {
  _id: string;
  orderId: string;
  status: 'aguardando_loja' | 'aprovado' | 'recusado' | 'aguardando_pagamento' | 'devolvendo' | 'concluido';
  reason: string;
  amount: number;
  includesDeliveryFee: boolean;
  mode?: string | null;
  pin?: string;
  rejectReasonText?: string | null;
  /** Arrependimento com motoboy: a corrida de volta, paga por Pix na conta da loja. */
  feeAmount?: number | null;
  feePix?: { qrCodePayload?: string | null; qrCodeImage?: string | null; expiresAt?: string | null };
  /** O motoboy não encontrou o cliente na retirada; ele escolhe de novo como devolver. */
  pickupMissedAt?: string | null;
  /** Corrida de volta (modo motoboy). O código de retirada só com o motoboy a caminho. */
  ride?: { status: string; motoboyName?: string | null; pickupPin?: string; fee?: number } | null;
}

export interface ReturnRequestCardProps {
  request: ReturnRequestView;
  storeName: string;
  storeAddress?: string;
  paymentMethod?: string;
  busy?: boolean;
  onChooseStore: () => void;
  /** Sem ele, só "Levo na loja". No arrependimento, o cliente paga a corrida por Pix antes. */
  onChooseMotoboy?: () => void;
  /** "Já paguei": confere o Pix da corrida. */
  onCheckFee?: () => void;
  onSupport: () => void;
}

const firstName = (name?: string | null) => String(name || '').split(' ')[0] || 'O motoboy';
const WHY: Record<string, string> = { defeito: 'veio com defeito', errado: 'veio diferente do pedido' };

/**
 * Acompanhamento do reembolso de um pedido entregue (DS v2, caso B): aguardando a loja, recusado,
 * aprovado (como devolver: levo na loja ou motoboy), devolvendo (código para a loja, ou a corrida
 * de volta) e concluído. O dinheiro só sai quando a loja digita o código.
 */
export function ReturnRequestCard({ request, storeName, storeAddress, paymentMethod, busy, onChooseStore, onChooseMotoboy, onCheckFee, onSupport }: ReturnRequestCardProps) {
  const [choice, setChoice] = useState<'loja' | 'motoboy'>('loja');
  const [copied, setCopied] = useState(false);
  const amount = formatMoney(Number(request.amount) || 0);

  if (request.status === 'aguardando_loja') {
    return <Alert tone="warning" title="Reembolso pedido">{`A ${storeName} está analisando. Avisamos aqui e no push.`}</Alert>;
  }
  if (request.status === 'recusado') {
    return (
      <Alert tone="error" title="Reembolso recusado" action={{ label: 'Falar com o suporte', onClick: onSupport }}>
        {`${request.rejectReasonText || 'A loja recusou'}. Se não concordar, fale com o suporte.`}
      </Alert>
    );
  }
  if (request.status === 'concluido') {
    return <Alert tone="success" title="Produto devolvido">{`O estorno de ${amount} está sendo processado e volta ${refundChannel(paymentMethod)} em até 7 dias.`}</Alert>;
  }
  if (request.status === 'aguardando_pagamento') {
    const pix = request.feePix || {};
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(String(pix.qrCodePayload || ''));
        setCopied(true);
      } catch {
        setCopied(false);
      }
    };
    return (
      <section className={styles.card} aria-label="Pagar a corrida de volta">
        <h2 className={styles.title}>{`Pague a corrida de volta: ${formatMoney(Number(request.feeAmount) || 0)}`}</h2>
        <p className={styles.text}>Com o Pix pago, procuramos um motoboy para buscar o produto aqui e levar à loja.</p>
        {pix.qrCodeImage && <img className={styles.qr} src={`data:image/png;base64,${pix.qrCodeImage}`} alt="QR do Pix da corrida" />}
        {pix.qrCodePayload && (
          <div className={styles.pixCode}>
            <span className={styles.cap}>Pix copia e cola</span>
            <code className={styles.payload}>{pix.qrCodePayload}</code>
            <Button variant="secondary" onClick={copy}>{copied ? 'Copiado' : 'Copiar código Pix'}</Button>
          </div>
        )}
        <Button onClick={onCheckFee} loading={busy}>Já paguei</Button>
        <Button variant="tertiary" onClick={onChooseStore} disabled={busy}>Prefiro levar na loja</Button>
      </section>
    );
  }
  if (request.status === 'devolvendo' && request.mode === 'motoboy') {
    const ride = request.ride;
    const who = firstName(ride?.motoboyName);
    if (ride?.status === 'assigned') {
      return (
        <section className={styles.card} aria-label="Devolução">
          <div className={styles.codeBox}>
            <span className={styles.cap}>Código de retirada</span>
            <p className={styles.code}>{ride.pickupPin}</p>
            <span className={styles.hint}>{`${who} está a caminho para buscar o produto. Mostre este código na retirada.`}</span>
          </div>
          <Alert tone="info" title={`Reembolso de ${amount}`}>{`Sai quando a loja receber o produto. Volta ${refundChannel(paymentMethod)}.`}</Alert>
        </section>
      );
    }
    if (ride?.status === 'picked') {
      return <Alert tone="info" title={`${who} está levando à loja`}>{`O reembolso de ${amount} sai quando a loja receber o produto.`}</Alert>;
    }
    return (
      <Alert tone="info" title="Procurando um motoboy">
        Avisamos quando alguém aceitar. O motoboy busca o produto aqui e leva à loja, sem custo para você.
      </Alert>
    );
  }
  if (request.status === 'devolvendo') {
    return (
      <section className={styles.card} aria-label="Devolução">
        <div className={styles.codeBox}>
          <span className={styles.cap}>Código de devolução</span>
          <p className={styles.code}>{request.pin}</p>
          <span className={styles.hint}>Mostre este código na loja ao entregar o produto.</span>
        </div>
        {storeAddress && <p className={styles.text}>{`${storeName} · ${storeAddress}`}</p>}
        <Alert tone="info" title={`Reembolso de ${amount}`}>{`Sai quando a loja digitar o código. Volta ${refundChannel(paymentMethod)}.`}</Alert>
      </section>
    );
  }

  // Depois de uma retirada sem sucesso (paga pela loja), só "levo na loja".
  const motoboyOk = !!onChooseMotoboy && !request.pickupMissedAt;
  return (
    <section className={styles.card} aria-label="Reembolso aprovado">
      {request.pickupMissedAt && (
        <Alert tone="warning" title="O motoboy não te encontrou">
          {request.reason === 'arrependimento'
            ? 'Agora a devolução é levando o produto na loja. A corrida paga não volta.'
            : 'Agora a devolução é levando o produto na loja.'}
        </Alert>
      )}
      <p className={styles.cap}>{`Aprovado pela ${storeName}`}</p>
      <h2 className={styles.title}>Como você vai devolver?</h2>
      <p className={styles.text}>{`O reembolso de ${amount} sai quando a loja receber o produto.`}</p>
      <div className={styles.choices} role="radiogroup" aria-label="Como devolver">
        <RadioRow
          name="como-devolver"
          value="loja"
          checked={choice === 'loja'}
          onChange={() => setChoice('loja')}
          label="Levo na loja"
          description={storeAddress ? `Grátis · ${storeAddress}` : 'Grátis'}
        />
        {motoboyOk && (
          <RadioRow
            name="como-devolver"
            value="motoboy"
            checked={choice === 'motoboy'}
            onChange={() => setChoice('motoboy')}
            label="Chamar um motoboy"
            description={request.reason === 'arrependimento'
              ? 'Você paga a corrida por Pix antes de o motoboy sair'
              : `Grátis: a loja paga, porque ${WHY[request.reason] ?? 'o produto veio com problema'}`}
          />
        )}
      </div>
      <Button onClick={choice === 'motoboy' && motoboyOk ? onChooseMotoboy : onChooseStore} loading={busy}>Continuar</Button>
    </section>
  );
}
