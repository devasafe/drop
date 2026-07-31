import { MapPin } from 'lucide-react';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { ICON_STROKE_WIDTH } from '../../ui/Icon';
import type { Address } from '../../../types/checkout';
import styles from './AddressSelector.module.css';

export interface AddressSelectorProps {
  selected: Address | null;
  addresses: Address[];
  onPick: (idx: number) => void;
  onAddNew: () => void;
}

function formatAddress(address: Address): string {
  return `${address.street}, ${address.number} — ${address.neighborhood}, ${address.city}/${address.state}`;
}

/** Mesmo endereço, comparado por `_id` quando ambos os lados têm um
 * (endereços salvos) ou por referência (endereço recém-selecionado antes
 * de persistir) — só usado para destacar a linha ativa na lista.
 */
function isSameAddress(a: Address, b: Address): boolean {
  if (a._id != null && b._id != null) return a._id === b._id;
  return a === b;
}

/**
 * Endereço de entrega do checkout: cabeçalho com o endereço atual (ou
 * convite a cadastrar), lista dos salvos clicável (`onPick`) e CTA que
 * delega a abertura do `AddressSheet` ao pai (`onAddNew`). De-cardificado:
 * lista com divisor `--line` entre linhas, sem cards aninhados.
 */
export function AddressSelector({ selected, addresses, onPick, onAddNew }: AddressSelectorProps) {
  if (!selected && addresses.length === 0) {
    return (
      <div className={styles.wrapper}>
        <EmptyState
          icon={<MapPin size={22} strokeWidth={ICON_STROKE_WIDTH} />}
          title="Nenhum endereço cadastrado"
          description="Adicione um endereço de entrega para continuar."
          action={<Button onClick={onAddNew}>Adicionar endereço</Button>}
        />
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>
          <MapPin size={18} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
          Endereço de entrega
        </span>
        <Button size="sm" variant="ghost" onClick={onAddNew}>
          {selected ? 'Trocar' : 'Adicionar'}
        </Button>
      </div>

      <p className={styles.current}>
        {selected ? formatAddress(selected) : 'Nenhum endereço selecionado.'}
      </p>

      {addresses.length > 0 && (
        <ul className={styles.list}>
          {addresses.map((address, idx) => {
            const active = selected != null && isSameAddress(address, selected);
            return (
              <li key={address._id ?? idx} className={styles.item}>
                <button
                  type="button"
                  className={[styles.row, active && styles.rowActive].filter(Boolean).join(' ')}
                  aria-pressed={active}
                  onClick={() => onPick(idx)}
                >
                  {formatAddress(address)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
