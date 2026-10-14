import { useEffect, useRef } from 'react';
import { Button } from '../../ui/Button';
import blocks from '../../panel/PanelBlocks.module.css';
import styles from './Corridas.module.css';

export type OfferLostVariant = 'claimed' | 'closed' | 'skipped';
const AUTO_HIDE_MS = 4000;

const TEXT: Record<OfferLostVariant, { title: string; body: (s: string) => string }> = {
  claimed: { title: 'Outro entregador aceitou antes', body: (s) => `${s}. As ofertas vão para vários entregadores ao mesmo tempo, e fica com quem aceitar primeiro.` },
  closed: { title: 'Este pedido foi cancelado', body: (s) => `${s}. O pedido foi cancelado antes da retirada. Não conta contra você.` },
  skipped: { title: 'Você pulou', body: (s) => `${s}. Pulada. Não conta contra você.` },
};

/** 409 ALREADY_CLAIMED / ORDER_CLOSED ou "Pular" (local). Some sozinho em 4 s e volta a procurar. */
export function OfferLost({ variant, summary, onContinue }: { variant: OfferLostVariant; summary: string; onContinue: () => void }) {
  const cb = useRef(onContinue);
  cb.current = onContinue;
  useEffect(() => {
    const t = setTimeout(() => cb.current(), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [variant, summary]);
  const t = TEXT[variant];
  return (
    <section className={`${blocks.blk} ${styles.lost}`} role="status">
      <div className={blocks.head}><span className={blocks.tag}>Corrida não está mais disponível</span></div>
      <b className={styles.lostTitle}>{t.title}</b>
      <p className={blocks.sub}>{t.body(summary)}</p>
      <Button onClick={() => cb.current()}>Continuar procurando</Button>
    </section>
  );
}

export default OfferLost;
