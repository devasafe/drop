import { useEffect, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { RadioRow } from '../ui/RadioRow';
import { Switch } from '../ui/Switch';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import type { SearchSort, SearchType } from '../../types/search';
import styles from './SearchFiltersSheet.module.css';

export interface SearchFiltersValue { sort: SearchSort; minPrice?: number; maxPrice?: number; openNow: boolean }
export interface SearchFiltersSheetProps { open: boolean; onClose: () => void; type: SearchType; value: SearchFiltersValue; hasPoint: boolean; onApply: (v: SearchFiltersValue) => void }

const SORTS: { value: SearchSort; label: string }[] = [
  { value: 'relevance', label: 'Relevância' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
  { value: 'distance', label: 'Mais perto' },
];
const toNum = (s: string) => { const n = Number(s.replace(',', '.')); return s.trim() && Number.isFinite(n) && n >= 0 ? n : undefined; };

export function activeFilterCount(v: SearchFiltersValue, type: SearchType): number {
  return (v.sort !== 'relevance' ? 1 : 0) + (type === 'products' && v.minPrice != null ? 1 : 0)
    + (type === 'products' && v.maxPrice != null ? 1 : 0) + (v.openNow ? 1 : 0);
}

export function SearchFiltersSheet({ open, onClose, type, value, hasPoint, onApply }: SearchFiltersSheetProps) {
  const [draft, setDraft] = useState(value);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  useEffect(() => {
    if (!open) return;
    setDraft(value);
    setMin(value.minPrice != null ? String(value.minPrice) : '');
    setMax(value.maxPrice != null ? String(value.maxPrice) : '');
  }, [open, value]);
  const sorts = type === 'stores' ? SORTS.filter((s) => s.value === 'relevance' || s.value === 'distance') : SORTS;
  return (
    <Sheet open={open} onClose={onClose} title="Filtros" presentation="bottom">
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Ordenar por</legend>
        {sorts.map((s) => (
          <RadioRow key={s.value} name="busca-ordem" value={s.value} label={s.label}
            description={s.value === 'distance' && !hasPoint ? 'Informe o endereço' : undefined}
            disabled={s.value === 'distance' && !hasPoint}
            checked={draft.sort === s.value} onChange={() => setDraft({ ...draft, sort: s.value })} />
        ))}
      </fieldset>
      {type === 'products' && (
        <div className={styles.prices}>
          <Input label="Preço mínimo" value={min} onChange={setMin} inputMode="decimal" placeholder="R$ 0" />
          <Input label="Preço máximo" value={max} onChange={setMax} inputMode="decimal" placeholder="R$ 500" />
        </div>
      )}
      <Switch label="Abertas agora" description={hasPoint ? undefined : 'Informe o endereço'} disabled={!hasPoint}
        checked={draft.openNow} onChange={(c) => setDraft({ ...draft, openNow: c })} />
      <div className={styles.actions}>
        <Button onClick={() => onApply({ ...draft, minPrice: toNum(min), maxPrice: toNum(max) })}>Ver resultados</Button>
        <Button variant="tertiary" onClick={() => onApply({ sort: 'relevance', openNow: false })}>Limpar</Button>
      </div>
    </Sheet>
  );
}
