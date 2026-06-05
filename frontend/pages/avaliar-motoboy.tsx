import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useDelivery, useOrder } from '../hooks/useSync';
import api from '../lib/api';
import Icon from '../components/Icon';
import LoadingSkeleton from '../components/LoadingSkeleton';
import styles from './AvaliarMotoboy.module.css';

function StarRating({ rating, setRating, disabled }: { rating: number; setRating: (n: number) => void; disabled?: boolean }) {
  const [hover, setHover] = useState(0);
  return (
    <div className={styles.starsRow}>
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => setRating(star)}
          onMouseEnter={() => !disabled && setHover(star)}
          onMouseLeave={() => !disabled && setHover(0)}
          className={styles.starBtn}
          style={{ transform: hover >= star ? 'scale(1.15)' : 'scale(1)' }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill={(hover || rating) >= star ? '#F59E0B' : 'none'} stroke={(hover || rating) >= star ? '#F59E0B' : 'rgba(255,255,255,0.2)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
      ))}
    </div>
  );
}

export default function AvaliacaoMotoboy() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { delivery } = useDelivery(id);
  const { order } = useOrder(delivery?.orderId);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [storeRating, setStoreRating] = useState<number>(0);
  const [storeComment, setStoreComment] = useState('');
  const [avaliando, setAvaliando] = useState(false);
  const [avaliado, setAvaliado] = useState(false);
  const [erroAvaliacao, setErroAvaliacao] = useState('');

  useEffect(() => {
    if (delivery && delivery.rating) setAvaliado(true);
  }, [delivery]);

  if (!delivery || !order) return (
    <div className={styles.loadingScreen}>
      <LoadingSkeleton variant="detail" />
    </div>
  );

  const handleSubmit = async () => {
    setErroAvaliacao('');
    if (rating === 0) { setErroAvaliacao('Selecione uma nota para o motoboy.'); return; }
    if (storeRating === 0) { setErroAvaliacao('Selecione uma nota para a loja.'); return; }
    setAvaliando(true);
    try {
      await api.post(`/deliveries/${delivery._id}/avaliar`, { rating, comment });
      await api.post(`/orders/${order._id}/evaluate-store`, { storeRating, storeComment });
      setAvaliado(true);
    } catch (e: any) {
      setErroAvaliacao(e?.response?.data?.error || 'Erro ao enviar avaliação');
    }
    setAvaliando(false);
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerIcon}><Icon name="star" /></div>
          <h1 className={styles.headerTitle}>
            Avalie sua Entrega
          </h1>
          <p className={styles.headerSubtitle}>
            Sua opinião ajuda a melhorar o serviço
          </p>
        </div>

        {avaliado ? (
          <div className={styles.successCard}>
            <div className={styles.successIcon}>✓</div>
            <h2 className={styles.successTitle}>Avaliação Enviada!</h2>
            <p className={styles.successText}>Obrigado pelo seu feedback.</p>
          </div>
        ) : (
          <div className={styles.form}>

            {/* Error */}
            {erroAvaliacao && (
              <div className={styles.errorBox}>
                {erroAvaliacao}
              </div>
            )}

            {/* Motoboy rating */}
            <div className={styles.ratingCard}>
              <h2 className={styles.ratingTitle}>
                Avalie o Motoboy
              </h2>
              <p className={styles.ratingSubtitle}>Como foi a sua entrega?</p>

              <div className={styles.starsWrapper}>
                <StarRating rating={rating} setRating={setRating} />
                {rating > 0 && (
                  <p className={styles.ratingLabel}>
                    {['', 'Muito ruim', 'Ruim', 'Ok', 'Bom', 'Excelente!'][rating]}
                  </p>
                )}
              </div>

              <textarea
                placeholder="Deixe um comentário para o motoboy (opcional)"
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={3}
                className={styles.textarea}
                onFocus={(e) => { e.target.style.borderColor = 'var(--drop-purple)'; e.target.style.boxShadow = '0 0 0 3px rgba(108,43,217,0.12)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--drop-border)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            {/* Store rating */}
            <div className={styles.ratingCard}>
              <h2 className={styles.ratingTitle}>
                Avalie a Loja
              </h2>
              <p className={styles.ratingSubtitle}>Como foram os produtos e atendimento?</p>

              <div className={styles.starsWrapper}>
                <StarRating rating={storeRating} setRating={setStoreRating} />
                {storeRating > 0 && (
                  <p className={styles.ratingLabel}>
                    {['', 'Muito ruim', 'Ruim', 'Ok', 'Bom', 'Excelente!'][storeRating]}
                  </p>
                )}
              </div>

              <textarea
                placeholder="Deixe um comentário para a loja (opcional)"
                value={storeComment}
                onChange={e => setStoreComment(e.target.value)}
                rows={3}
                className={styles.textarea}
                onFocus={(e) => { e.target.style.borderColor = 'var(--drop-purple)'; e.target.style.boxShadow = '0 0 0 3px rgba(108,43,217,0.12)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--drop-border)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <button
              disabled={avaliando}
              onClick={handleSubmit}
              className={styles.btnSubmit}
            >
              {avaliando ? 'Enviando...' : 'Enviar Avaliação'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
