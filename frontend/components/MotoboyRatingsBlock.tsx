import { useEffect, useState } from 'react';
import api from '../lib/api';
import styles from './MotoboyRatingsBlock.module.css';

interface MotoboyRatingsBlockProps {
  motoboyId: string;
}

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={[styles.stars, className].filter(Boolean).join(' ')} aria-label={`${value} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={value >= s ? styles.starOn : styles.star} aria-hidden="true">★</span>
      ))}
    </span>
  );
}

export default function MotoboyRatingsBlock({ motoboyId }: MotoboyRatingsBlockProps) {
  const [ratings, setRatings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!motoboyId) return;
    api.get(`/deliveries/motoboy/${motoboyId}/ratings`)
      .then((r) => setRatings(Array.isArray(r.data) ? r.data : []))
      .catch(() => setRatings([]))
      .finally(() => setLoading(false));
  }, [motoboyId]);

  if (loading) return <p className={styles.muted}>Carregando avaliações…</p>;

  if (ratings.length === 0) {
    return (
      <p className={styles.muted}>
        Você ainda não recebeu avaliações. Complete entregas para começar a construir sua reputação.
      </p>
    );
  }

  const avg = ratings.reduce((sum, av) => sum + (av.rating || 0), 0) / ratings.length;

  return (
    <div>
      <div className={styles.summary}>
        <span className={styles.avg}>{avg.toFixed(1)}</span>
        <div className={styles.summaryMeta}>
          <Stars value={Math.round(avg)} />
          <span className={styles.count}>{ratings.length} {ratings.length === 1 ? 'avaliação' : 'avaliações'}</span>
        </div>
      </div>

      <div className={styles.list}>
        {ratings.map((av, idx) => (
          <div key={idx} className={styles.item}>
            <Stars value={av.rating} className={styles.itemStars} />
            {av.comment && <p className={styles.comment}>{av.comment}</p>}
            <span className={styles.date}>{new Date(av.createdAt).toLocaleDateString('pt-BR')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
