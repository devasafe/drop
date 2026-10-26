import { useCallback, useEffect, useId, useRef, useState } from 'react';
import api from '../../../lib/api';
import { Button } from '../../ui/Button';
import { RadioRow } from '../../ui/RadioRow';
import { formatMoney } from '../../../lib/money';
import { apiError } from '../../../lib/sellerApi';
import styles from './ReturnRequestBlock.module.css';

const REASON_LABEL: Record<string, string> = {
  defeito: 'veio com defeito',
  errado: 'veio diferente do pedido',
  arrependimento: 'se arrependeu',
};

/** Mesmos códigos do backend (RETURN_REJECT_REASONS): o cliente vê só a frase. */
const REJECT_REASONS: { code: string; label: string }[] = [
  { code: 'usado', label: 'Produto com marca de uso' },
  { code: 'fora_prazo', label: 'Fora do prazo' },
  { code: 'sem_defeito', label: 'Sem defeito na análise' },
  { code: 'outro', label: 'Outro motivo: o suporte do DROP avalia' },
];

function refundRule(rr: any): string {
  const tail = 'Sai da sua conta Asaas só quando você receber o produto e digitar o código.';
  if (!rr.includesDeliveryFee) return `Arrependimento fora do prazo: volta sem a taxa de entrega. ${tail}`;
  const why = rr.reason === 'arrependimento' ? 'Arrependimento no prazo' : rr.reason === 'errado' ? 'Produto errado' : 'Defeito';
  return `${why}: volta tudo. ${tail}`;
}

/**
 * Reembolso de pedido entregue na tela da loja (DS v2, caso B): responder (aprovar ou recusar com
 * motivo da lista) e, com o produto voltando, digitar o código de devolução, que dispara o estorno.
 * `version` muda quando o painel recebe a mudança pelo socket: aí relê o pedido de reembolso.
 */
export function ReturnRequestBlock({ orderId, customerName, version, onChange }: {
  orderId: string;
  customerName?: string;
  version?: string;
  onChange: () => void;
}) {
  const pinId = useId();
  const [rr, setRr] = useState<any | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectCode, setRejectCode] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const name = String(customerName || '').split(' ')[0] || 'Cliente';

  const load = useCallback(() => {
    api.get(`/orders/${orderId}/return-request`).then((r) => setRr(r.data || null)).catch(() => undefined);
  }, [orderId]);
  useEffect(load, [load, version]);

  const act = async (path: string, body: Record<string, unknown>, onError?: (status?: number, message?: string) => string) => {
    if (!rr || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post(`/return-requests/${rr._id}/${path}`, body);
      setRr(r.data);
      setRejecting(false);
      setPin('');
      onChange();
    } catch (err) {
      const e = apiError(err);
      setError(onError ? onError(e.status, e.message) : e.message || 'Não deu agora. Tente de novo.');
      if (e.status === 409) load();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  if (!rr) return null;
  const amount = formatMoney(Number(rr.amount) || 0);

  if (rr.status === 'aguardando_loja') {
    return (
      <section className={styles.block} aria-label="Pedido de reembolso">
        <h2 className={styles.title}>{`${name} · ${REASON_LABEL[rr.reason] ?? rr.reason}`}</h2>
        {rr.note && <p className={styles.quote}>{`"${rr.note}"`}</p>}
        {rr.photoUrl && <img src={rr.photoUrl} alt="Foto do problema" className={styles.photo} />}
        <div className={styles.sumRow}><span>Reembolso</span><b>{amount}</b></div>
        <p className={styles.meta}>{refundRule(rr)}</p>
        {rr.reason !== 'arrependimento' && (
          <p className={styles.meta}>Se o cliente chamar um motoboy, a corrida de volta é sua: o valor sai da sua conta Asaas quando você confirmar o produto.</p>
        )}
        {rejecting ? (
          <>
            <div className={styles.choices} role="radiogroup" aria-label="Motivo da recusa">
              {REJECT_REASONS.map((r) => (
                <RadioRow key={r.code} name="motivo-recusa-reembolso" value={r.code} checked={rejectCode === r.code} onChange={() => setRejectCode(r.code)} label={r.label} tone="danger" disabled={busy} />
              ))}
            </div>
            <div className={styles.actions}>
              <Button variant="danger" onClick={() => rejectCode && act('reject', { reasonCode: rejectCode })} disabled={!rejectCode} loading={busy}>Confirmar recusa</Button>
              <Button variant="tertiary" onClick={() => { setRejecting(false); setRejectCode(null); }} disabled={busy}>Voltar</Button>
            </div>
          </>
        ) : (
          <div className={styles.actions}>
            <Button onClick={() => act('approve', {})} loading={busy}>Aprovar reembolso</Button>
            <Button variant="secondary" onClick={() => setRejecting(true)} disabled={busy}>Recusar</Button>
          </div>
        )}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </section>
    );
  }

  const motoboyMode = rr.mode === 'motoboy';
  const courier = String(rr.ride?.motoboyName || '').split(' ')[0] || 'O motoboy';
  if (rr.status === 'devolvendo' && motoboyMode && rr.ride?.status !== 'picked') {
    return (
      <section className={styles.block} aria-label="Devolução do cliente">
        <h2 className={styles.title}>{rr.ride?.status === 'assigned' ? `${courier} vai buscar com ${name}` : `Procurando um motoboy para buscar com ${name}`}</h2>
        <p className={styles.meta}>{`A corrida (${formatMoney(Number(rr.ride?.fee) || 0)}) sai da sua conta Asaas quando você confirmar o produto.`}</p>
      </section>
    );
  }

  if (rr.status === 'devolvendo') {
    return (
      <section className={styles.block} aria-label="Devolução do cliente">
        <h2 className={styles.title}>{motoboyMode ? `${courier} está trazendo o produto` : `${name} vai trazer o produto no balcão`}</h2>
        <p className={styles.meta}>{motoboyMode ? 'Peça o código ao motoboy na entrega do produto. Confira o produto antes de digitar.' : 'Confira o produto antes de digitar o código.'}</p>
        <label htmlFor={pinId} className={styles.label}>Código de devolução (5 dígitos)</label>
        <div className={styles.pinRow}>
          <input
            id={pinId}
            className={styles.input}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={5}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 5))}
            disabled={busy}
          />
          <Button
            onClick={() => act('confirm', { pin }, (status, message) => (status === 400 ? 'Código não confere. Peça o código de novo.' : message || 'Não deu para confirmar agora. Tente de novo.'))}
            disabled={pin.length !== 5}
            loading={busy}
          >
            Confirmar devolução
          </Button>
        </div>
        <p className={styles.meta}>{`Ao confirmar, ${amount} voltam para o cliente pela sua conta Asaas.`}</p>
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </section>
    );
  }

  if (rr.status === 'aprovado') {
    return (
      <section className={styles.block} aria-label="Reembolso aprovado">
        <h2 className={styles.title}>Reembolso aprovado</h2>
        <p className={styles.meta}>{`Aguardando ${name} escolher como devolver. Você recebe um aviso quando o produto estiver vindo.`}</p>
      </section>
    );
  }

  return (
    <section className={styles.block} aria-label="Reembolso">
      <h2 className={styles.title}>{rr.status === 'concluido' ? 'Produto devolvido' : 'Reembolso recusado'}</h2>
      <p className={styles.meta}>
        {rr.status === 'concluido' ? `Estorno de ${amount} pedido pela sua conta Asaas.` : `Motivo: ${rr.rejectReasonText ?? '—'}.`}
      </p>
    </section>
  );
}
