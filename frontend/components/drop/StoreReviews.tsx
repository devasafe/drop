import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { Sheet } from '../ui/Sheet';
import { Rating } from '../ui/Rating';
import styles from './StoreReviews.module.css';

interface Review {
  orderId?: string;
  storeRating: number;
  storeComment?: string | null;
  createdAt: string;
  storeReply?: string | null;
  storeRepliedAt?: string | null;
}

const when = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  return days <= 0 ? 'hoje' : days === 1 ? 'ontem' : d.toLocaleDateString('pt-BR');
};

/** "O que dizem" (protótipo Loja): a última avaliação com comentário; "Ver N" abre todas, com a resposta da loja. */
export function StoreReviews({ storeId }: { storeId: string }) {
  const [list, setList] = useState<Review[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let off = false;
    api.get(`/stores/${storeId}/ratings`)
      .then((r) => { if (!off) setList(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (!off) setList([]); });
    return () => { off = true; };
  }, [storeId]);

  const withText = (list || []).filter((r) => r.storeComment && r.storeComment.trim());
  if (!list || withText.length === 0) return null;
  const top = withText[0];

  return (
    <section className={styles.block} aria-labelledby="loja-reviews">
      <div className={styles.head}>
        <h2 id="loja-reviews" className={styles.title}>O que dizem</h2>
        <button type="button" className={styles.link} onClick={() => setOpen(true)}>{`Ver ${list.length}`}</button>
      </div>
      <p className={styles.quote}>
        {`"${top.storeComment!.trim()}"`} <span className={styles.meta}>{`· ${when(top.createdAt)}`}</span>
      </p>
      <Sheet open={open} onClose={() => setOpen(false)} title="O que dizem" presentation="bottom">
        <ul className={styles.list}>
          {list.map((r, i) => (
            <li key={r.orderId ?? i} className={styles.item}>
              <Rating value={r.storeRating} />
              {r.storeComment && <p className={styles.text}>{r.storeComment}</p>}
              <span className={styles.meta}>{when(r.createdAt)}</span>
              {r.storeReply && r.storeReply.trim() && (
                <div className={styles.reply}>
                  <span className={styles.replyLabel}>Resposta da loja</span>
                  <p className={styles.replyText}>{r.storeReply}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Sheet>
    </section>
  );
}
