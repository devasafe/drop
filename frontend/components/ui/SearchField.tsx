import { InputHTMLAttributes } from 'react';
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
  /** Enter no campo. */
  onSubmit?: (value: string) => void;
  inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'placeholder' | 'type' | 'disabled'>;
}

/**
 * Campo de busca do DROP (`.srch` no mock canônico): `Input` com ícone de
 * lupa + `IconButton` `brandSquare` de filtro opcional (quadrado roxo
 * sólido, ícone branco, 42px — bate a altura do Input, replica `.srch .f`).
 * Botão de filtro exige nome acessível (`aria-label="Filtrar"`) por não ter
 * texto visível.
 */
export function SearchField({ value, onChange, placeholder, onFilter, onSubmit, inputProps }: SearchFieldProps) {
  return (
    <div className={styles.searchField}>
      <Input
        className={styles.box}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        type="search"
        enterKeyHint="search"
        {...inputProps}
        onKeyDown={(e) => {
          inputProps?.onKeyDown?.(e);
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) onSubmit?.(value);
        }}
        leftIcon={<Search size={17} strokeWidth={ICON_STROKE_WIDTH} />}
      />
      {onFilter && (
        <IconButton
          icon={<SlidersHorizontal size={18} strokeWidth={ICON_BUTTON_STROKE_WIDTH} />}
          variant="brandSquare"
          aria-label="Filtrar"
          onClick={onFilter}
        />
      )}
    </div>
  );
}
