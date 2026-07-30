import { Search, SlidersHorizontal } from 'lucide-react';
import { Input } from './Input';
import { IconButton } from './IconButton';
import { ICON_STROKE_WIDTH, ICON_BUTTON_STROKE_WIDTH } from './Icon';
import styles from './SearchField.module.css';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onFilter?: () => void;
}

/**
 * Campo de busca do DROP (`.srch` no mock canônico): `Input` com ícone de
 * lupa + `IconButton` brand de filtro opcional. Botão de filtro exige nome
 * acessível (`aria-label="Filtrar"`) por não ter texto visível.
 */
export function SearchField({ value, onChange, placeholder, onFilter }: SearchFieldProps) {
  return (
    <div className={styles.searchField}>
      <Input
        className={styles.box}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        leftIcon={<Search size={17} strokeWidth={ICON_STROKE_WIDTH} />}
      />
      {onFilter && (
        <IconButton
          icon={<SlidersHorizontal size={18} strokeWidth={ICON_BUTTON_STROKE_WIDTH} />}
          variant="brand"
          aria-label="Filtrar"
          onClick={onFilter}
        />
      )}
    </div>
  );
}
