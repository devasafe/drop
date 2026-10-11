import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import styles from './ReorderConfirmSheet.module.css';

export interface ReorderConfirmSheetProps { open: boolean; onClose: () => void; onConfirm: () => void; busy: boolean; currentCount: number; currentStoreName?: string; targetStoreName?: string; sameStore: boolean }

/** Confirmação destrutiva de "Comprar de novo": a sacola atual será substituída. */
export function ReorderConfirmSheet({ open, onClose, onConfirm, busy, currentCount, currentStoreName, targetStoreName, sameStore }: ReorderConfirmSheetProps) {
  const itens = `${currentCount} ${currentCount === 1 ? 'item' : 'itens'}`;
  return (
    <Sheet open={open} onClose={onClose} title="Trocar a sacola?" presentation="center">
      <p className={styles.text}>
        {sameStore
          ? `Sua sacola tem ${itens}. Os itens deste pedido vão substituir os que estão nela.`
          : `Sua sacola tem ${itens}${currentStoreName ? ` da ${currentStoreName}` : ''}. Cada pedido é de uma loja só: para comprar de novo${targetStoreName ? ` na ${targetStoreName}` : ''}, a sacola atual será esvaziada.`}
      </p>
      <div className={styles.actions}>
        <Button loading={busy} onClick={onConfirm}>Trocar a sacola</Button>
        <Button variant="secondary" onClick={onClose}>Manter minha sacola</Button>
      </div>
    </Sheet>
  );
}
