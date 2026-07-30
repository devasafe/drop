import styles from './Skeleton.module.css';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
}

/**
 * Placeholder de carregamento com shimmer entre `--surface`/`--surface-2`.
 * Usar no formato do conteúdo final (largura/altura/raio configuráveis) no
 * lugar de spinner genérico, para listas/cards que ainda não têm dados.
 */
export function Skeleton({ width = '100%', height = 16, radius }: SkeletonProps) {
  return (
    <span
      className={styles.skeleton}
      style={{ width, height, ...(radius !== undefined ? { borderRadius: radius } : {}) }}
      aria-hidden="true"
    />
  );
}
