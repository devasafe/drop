import { KeyboardEvent, useRef } from 'react';
import styles from './Tabs.module.css';

export interface TabItem {
  id: string;
  label: string;
  /** Contador opcional ("Em andamento 2"). */
  count?: number;
}

export interface TabsProps {
  /** Nome do grupo para leitor de tela ("Pedidos"). */
  label: string;
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Prefixo dos ids: a aba `x` controla o painel `${idPrefix}-panel-x`. */
  idPrefix?: string;
}

/**
 * Abas (DS v2): Pedidos (em andamento / histórico), resultados (produtos /
 * lojas). Controladas: o painel é do consumidor — use `tabPanelProps` para
 * ligar painel e aba. Teclado: setas andam e dão a volta, Home/End vão às
 * pontas; só a aba ativa entra no Tab (roving tabindex).
 */
export function Tabs({ label, items, value, onChange, idPrefix = 'tabs' }: TabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const go = (index: number) => {
    const next = items[(index + items.length) % items.length];
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: items.length - 1,
    };
    if (e.key in moves) {
      e.preventDefault();
      go(moves[e.key]);
    }
  };

  return (
    <div role="tablist" aria-label={label} className={styles.list}>
      {items.map((item, i) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => { refs.current[item.id] = el; }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            className={[styles.tab, selected && styles.selected].filter(Boolean).join(' ')}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {item.label}
            {item.count !== undefined && <span className={styles.count}>{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Atributos do painel que corresponde à aba `id`. */
export function tabPanelProps(id: string, idPrefix = 'tabs') {
  return {
    role: 'tabpanel' as const,
    id: `${idPrefix}-panel-${id}`,
    'aria-labelledby': `${idPrefix}-tab-${id}`,
    tabIndex: 0,
  };
}
