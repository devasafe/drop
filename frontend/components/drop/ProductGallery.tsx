import { KeyboardEvent as ReactKeyboardEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Package, X } from 'lucide-react';
import { imageUrl } from '../../lib/config';
import { ICON_STROKE_WIDTH } from '../ui/Icon';
import styles from './ProductGallery.module.css';

/** Índice da foto mais perto da posição de rolagem (cada foto tem a largura da faixa). */
function indexAt(track: HTMLElement | null, count: number) {
  if (!track || !track.clientWidth) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(track.scrollLeft / track.clientWidth)));
}

function goTo(track: HTMLElement | null, idx: number, smooth = true) {
  if (!track) return;
  const left = idx * track.clientWidth;
  if (typeof track.scrollTo === 'function') track.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  else track.scrollLeft = left;
}

interface Props {
  /** Caminhos das fotos como vêm do produto (images[] ou image). */
  images: string[];
  name: string;
  /** Por cima da foto grande: botão voltar, aviso de esgotado. */
  children?: ReactNode;
  /** Classe extra da foto grande (ex.: cantos no desktop). */
  className?: string;
}

/**
 * Fotos do produto: a foto grande é uma faixa com snap que se arrasta para o lado
 * (bolinhas e miniaturas acompanham; tocar numa miniatura rola até ela). Tocar na
 * foto abre a tela cheia, onde também se arrasta; fecha no X, no Esc ou no voltar
 * do navegador/celular.
 */
export function ProductGallery({ images, name, children, className }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const count = images.length;
  const safe = Math.min(active, Math.max(0, count - 1));

  // Outro produto (mesma página, rota nova): volta à primeira foto.
  const key = images.join('|');
  useEffect(() => {
    setActive(0);
    goTo(trackRef.current, 0, false);
  }, [key]);

  const select = (idx: number) => {
    setActive(idx);
    goTo(trackRef.current, idx);
  };

  // Ao fechar a tela cheia, a foto grande fica na última vista.
  const closeViewer = useCallback((last: number) => {
    setViewer(null);
    setActive(last);
    goTo(trackRef.current, last, false);
  }, []);

  return (
    <>
      <section className={[styles.hero, className].filter(Boolean).join(' ')} aria-label={`Fotos de ${name}`}>
        {count === 0 ? (
          <span className={styles.empty} aria-hidden="true">
            <Package size={40} strokeWidth={ICON_STROKE_WIDTH} />
          </span>
        ) : (
          <div
            ref={trackRef}
            className={styles.track}
            onScroll={() => setActive(indexAt(trackRef.current, count))}
          >
            {images.map((img, i) => (
              <button
                key={img + i}
                type="button"
                className={styles.slide}
                onClick={() => setViewer(i)}
                aria-label={count > 1 ? `Abrir foto ${i + 1} de ${count} de ${name}` : `Abrir foto de ${name}`}
              >
                <img src={imageUrl(img)} alt="" draggable={false} />
              </button>
            ))}
          </div>
        )}
        {count > 1 && (
          <span className={styles.dots} aria-hidden="true">
            {images.map((_, i) => <i key={i} className={i === safe ? styles.dotOn : undefined} />)}
          </span>
        )}
        {children}
      </section>

      {count > 1 && (
        <div className={styles.thumbsRow}>
          {images.map((img, idx) => (
            <button
              key={img + idx}
              type="button"
              className={[styles.thumb, idx === safe && styles.thumbActive].filter(Boolean).join(' ')}
              onClick={() => select(idx)}
              aria-label={`Ver foto ${idx + 1} de ${name}`}
              aria-pressed={idx === safe}
            >
              <img src={imageUrl(img)} alt="" />
            </button>
          ))}
        </div>
      )}

      {viewer !== null && <PhotoViewer images={images} name={name} start={viewer} onClose={closeViewer} />}
    </>
  );
}

/** Marca da entrada que a tela cheia põe no histórico. */
export const VIEWER_HISTORY_KEY = 'dropPhotoViewer';

/** Tela cheia das fotos (portal no body, acima da TabBar e dos sheets). */
function PhotoViewer({ images, name, start, onClose }: { images: string[]; name: string; start: number; onClose: (last: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [idx, setIdx] = useState(start);
  const idxRef = useRef(start);
  idxRef.current = idx;
  const count = images.length;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Abre na foto tocada, trava a rolagem da página e devolve o foco a quem abriu.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    goTo(trackRef.current, start, false);
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // O voltar do celular fecha a tela cheia em vez de sair do produto: a tela põe uma entrada
  // própria no histórico. `__N: false` faz o roteador do Next ignorar essa entrada no popstate.
  useEffect(() => {
    window.history.pushState({ ...(window.history.state || {}), __N: false, [VIEWER_HISTORY_KEY]: true }, '');
    const onPop = () => onCloseRef.current(idxRef.current);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // X e Esc desfazem a entrada do histórico; quem fecha é o popstate.
  const close = () => {
    if (window.history.state?.[VIEWER_HISTORY_KEY]) window.history.back();
    else onCloseRef.current(idxRef.current);
  };

  const show = (next: number) => {
    const n = Math.max(0, Math.min(count - 1, next));
    setIdx(n);
    goTo(trackRef.current, n);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); show(idx + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
  };

  return createPortal(
    <div className={styles.viewer} role="dialog" aria-modal="true" aria-label={`Fotos de ${name}`} onKeyDown={onKeyDown}>
      <div className={styles.viewerBar}>
        {count > 1 ? <span className={styles.counter} aria-live="polite">{`${idx + 1} / ${count}`}</span> : <span />}
        <button ref={closeRef} type="button" className={styles.viewerBtn} onClick={close} aria-label="Fechar fotos">
          <X size={22} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
        </button>
      </div>
      <div
        ref={trackRef}
        className={styles.viewerTrack}
        onScroll={() => setIdx(indexAt(trackRef.current, count))}
      >
        {images.map((img, i) => (
          <div key={img + i} className={styles.viewerSlide}>
            <img src={imageUrl(img, { w: 1600 })} alt={count > 1 ? `Foto ${i + 1} de ${count} de ${name}` : `Foto de ${name}`} draggable={false} />
          </div>
        ))}
      </div>
      {count > 1 && (
        <>
          <button type="button" className={`${styles.viewerBtn} ${styles.prev}`} onClick={() => show(idx - 1)} disabled={idx === 0} aria-label="Foto anterior">
            <ChevronLeft size={24} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
          </button>
          <button type="button" className={`${styles.viewerBtn} ${styles.next}`} onClick={() => show(idx + 1)} disabled={idx === count - 1} aria-label="Próxima foto">
            <ChevronRight size={24} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}

export default ProductGallery;
