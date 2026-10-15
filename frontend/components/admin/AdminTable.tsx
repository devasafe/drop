import { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import { useMinWidth, ADMIN_DESKTOP_MIN } from '../../hooks/useMinWidth';
import styles from './AdminTable.module.css';

export interface AdminColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
  /** Título do cartão no celular (padrão: a primeira coluna). */
  primary?: boolean;
}

export interface AdminTableProps<T> {
  columns: AdminColumn<T>[];
  /** null = ainda não carregou (mostra o esqueleto). */
  rows: T[] | null;
  rowKey: (row: T) => string;
  loading?: boolean;
  /** Mensagem de erro da leitura. Vence as linhas e o vazio (fail closed). */
  error?: string | null;
  onRetry?: () => void;
  /** Texto do estado vazio. */
  empty?: string;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (s: Set<string>) => void;
  /** Ação principal da linha (no celular, no pé do cartão). */
  rowAction?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  /** Nome da linha para o leitor de tela ("Selecionar Eletro Center"). */
  rowLabel?: (row: T) => string;
  caption?: string;
}

/** Tabela do admin (DS v2, D3a; protótipo .u-table). Abaixo de 1024 px vira lista de cartões. */
export function AdminTable<T>({
  columns, rows, rowKey, loading = false, error = null, onRetry, empty = 'Nada por aqui.',
  selectable = false, selected, onSelectedChange, rowAction, onRowClick, rowLabel, caption,
}: AdminTableProps<T>) {
  const desktop = useMinWidth(ADMIN_DESKTOP_MIN);

  if (error) {
    return (
      <div className={styles.state} role="alert">
        <EmptyState
          variant="error"
          icon={<AlertTriangle size={28} aria-hidden="true" />}
          title="Não deu para carregar"
          description={error}
          onRetry={onRetry}
        />
      </div>
    );
  }

  if (loading || rows === null) {
    return (
      <div className={styles.state} aria-busy="true" aria-label="Carregando">
        <Skeleton height={20} />
        <Skeleton height={20} />
        <Skeleton height={20} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className={styles.state}>
        <EmptyState icon={<Inbox size={28} aria-hidden="true" />} title={empty} />
      </div>
    );
  }

  const sel = selected ?? new Set<string>();
  const keys = rows.map(rowKey);
  const allOn = keys.every((k) => sel.has(k));
  const toggle = (k: string) => {
    const next = new Set(sel);
    if (next.has(k)) next.delete(k); else next.add(k);
    onSelectedChange?.(next);
  };
  const toggleAll = () => {
    const next = new Set(sel);
    if (allOn) keys.forEach((k) => next.delete(k)); else keys.forEach((k) => next.add(k));
    onSelectedChange?.(next);
  };
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const labelOf = (row: T, i: number) => (rowLabel ? rowLabel(row) : `linha ${i + 1}`);
  const titleOf = (row: T) => (onRowClick
    ? <button type="button" className={styles.rowLink} onClick={() => onRowClick(row)}>{primary.render(row)}</button>
    : primary.render(row));
  const checkbox = (checked: boolean, onChange: () => void, label: string) => (
    <label className={styles.checkHit}>
      <input type="checkbox" className={styles.check} checked={checked} onChange={onChange} aria-label={label} />
    </label>
  );

  if (!desktop) {
    return (
      <div className={styles.cardsWrap}>
        {selectable && (
          <div className={styles.cardsHead}>
            {checkbox(allOn, toggleAll, 'Selecionar todos')}
            <span>Selecionar todos</span>
          </div>
        )}
        <ul className={styles.cards} aria-label={caption}>
          {rows.map((row, i) => {
            const k = keys[i];
            const on = sel.has(k);
            return (
              <li key={k} className={on ? `${styles.card} ${styles.cardOn}` : styles.card}>
                <div className={styles.cardHead}>
                  {selectable && checkbox(on, () => toggle(k), `Selecionar ${labelOf(row, i)}`)}
                  <div className={styles.cardTitle}>{titleOf(row)}</div>
                </div>
                <dl className={styles.cardFields}>
                  {columns.filter((c) => c !== primary).map((c) => (
                    <div key={c.key} className={styles.field}>
                      <dt>{c.header}</dt>
                      <dd className={c.align === 'right' ? styles.right : undefined}>{c.render(row)}</dd>
                    </div>
                  ))}
                </dl>
                {rowAction && <div className={styles.cardAction}>{rowAction(row)}</div>}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        {caption && <caption className={styles.caption}>{caption}</caption>}
        <thead>
          <tr>
            {selectable && <th scope="col" className={styles.checkCol}>{checkbox(allOn, toggleAll, 'Selecionar todos')}</th>}
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.align === 'right' ? styles.right : undefined}>{c.header}</th>
            ))}
            {rowAction && <th scope="col"><span className={styles.srOnly}>Ações</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const k = keys[i];
            const on = sel.has(k);
            return (
              <tr key={k} className={on ? styles.rowOn : undefined}>
                {selectable && <td className={styles.checkCol}>{checkbox(on, () => toggle(k), `Selecionar ${labelOf(row, i)}`)}</td>}
                {columns.map((c) => (
                  <td key={c.key} className={c.align === 'right' ? styles.right : undefined}>
                    {c === primary ? titleOf(row) : c.render(row)}
                  </td>
                ))}
                {rowAction && <td className={styles.actionCell}>{rowAction(row)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default AdminTable;
