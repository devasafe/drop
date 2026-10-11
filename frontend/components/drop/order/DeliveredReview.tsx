import { useState } from 'react';
import { Rating } from '../../ui/Rating';
import { Button } from '../../ui/Button';
import { Alert } from '../../ui/Alert';
import { initials } from '../../ui/Avatar';
import styles from './DeliveredReview.module.css';

export interface DeliveredReviewProps {
  storeName: string;
  courier?: { name: string; plate?: string | null } | null;
  createdAt?: string;
  deliveredAt?: string | null;
  storeDone: boolean;
  courierDone: boolean;
  onSubmit: (v: { store: number; courier: number; storeComment: string; courierComment: string }) => Promise<void>;
  onHelp: () => void;
}

const hhmm = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;

/** Pedido entregue (protótipo): a hora real e as duas avaliações num envio só. */
export function DeliveredReview({ storeName, courier, createdAt, deliveredAt, storeDone, courierDone, onSubmit, onHelp }: DeliveredReviewProps) {
  const [store, setStore] = useState(0);
  const [cour, setCour] = useState(0);
  const [storeComment, setStoreComment] = useState('');
  const [courierComment, setCourierComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const minutes = createdAt && deliveredAt ? Math.round((Date.parse(deliveredAt) - Date.parse(createdAt)) / 60000) : null;
  const time = hhmm(deliveredAt);
  const hasCourier = !!courier;
  const done = storeDone && (!hasCourier || courierDone);
  const low = (store > 0 && store <= 2) || (cour > 0 && cour <= 2);

  const send = async () => {
    setSending(true);
    try {
      await onSubmit({
        store: storeDone ? 0 : store,
        courier: courierDone ? 0 : cour,
        storeComment: storeComment.trim(),
        courierComment: courierComment.trim(),
      });
      setSent(true);
    } catch {
      // a página já mostrou o motivo; o formulário fica para tentar de novo
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <section className={styles.block}>
        <span className={styles.badge}>{time ? `Entregue às ${time}` : 'Entregue'}</span>
        <p className={styles.big}>Pedido entregue</p>
        {minutes != null && minutes > 0 && <p className={styles.sub}>{`${minutes} min do pagamento até a sua porta.`}</p>}
      </section>

      {sent && low && (
        <Alert tone="warning" title="O que deu errado?" action={{ label: 'Falar com o suporte', onClick: onHelp }}>
          Conte para a gente: resolvemos pelo pedido.
        </Alert>
      )}

      {done || sent ? (
        <Alert tone="success" title="Obrigado pela avaliação">Sua nota ajuda outras pessoas a escolher.</Alert>
      ) : (
        <>
          {!storeDone && (
            <section className={styles.block}>
              <div className={styles.who}>
                <span className={styles.logo} aria-hidden="true">{initials(storeName)}</span>
                <div>
                  <p className={styles.q}>{`Como foi a ${storeName}?`}</p>
                  <p className={styles.hint}>Produto, embalagem, atendimento</p>
                </div>
              </div>
              <Rating value={store} onChange={setStore} label="Nota da loja" />
              <label className={styles.label} htmlFor="rev-loja">Comentário sobre a loja (opcional)</label>
              <input id="rev-loja" className={styles.input} value={storeComment} onChange={(e) => setStoreComment(e.target.value)} maxLength={300} />
            </section>
          )}
          {hasCourier && !courierDone && (
            <section className={styles.block}>
              <div className={styles.who}>
                <span className={styles.avatar} aria-hidden="true">{initials(courier!.name)}</span>
                <div>
                  <p className={styles.q}>{`E o ${courier!.name.split(' ')[0]}, na entrega?`}</p>
                  {courier!.plate && <p className={styles.hint}>{`Moto ${courier!.plate}`}</p>}
                </div>
              </div>
              <Rating value={cour} onChange={setCour} label="Nota do entregador" />
              <label className={styles.label} htmlFor="rev-entrega">Comentário sobre a entrega (opcional)</label>
              <input id="rev-entrega" className={styles.input} value={courierComment} onChange={(e) => setCourierComment(e.target.value)} maxLength={300} />
            </section>
          )}
          <Button onClick={send} loading={sending} disabled={store === 0 && cour === 0}>Enviar avaliações</Button>
        </>
      )}
    </div>
  );
}

export default DeliveredReview;
