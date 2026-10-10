import { Check, MapPin, Plus } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { formatMoney } from '../../lib/money';
import { useAddressQuotes } from '../../hooks/useAddressQuotes';
import { addressId, shortAddress, type SavedAddress } from '../../hooks/useDeliveryAddress';
import type { DeliveryQuote } from '../../types/delivery';
import styles from './AddressPickerSheet.module.css';

export interface AddressPickerSheetProps {
  open: boolean; onClose: () => void; addresses: SavedAddress[]; selectedId: string | null;
  onPick: (a: SavedAddress) => void; onAddNew: () => void; storeId?: string | null; storeName?: string;
}

function quoteText(q?: DeliveryQuote): { text: string; tone: 'ok' | 'error' | 'muted' } | null {
  if (!q) return null;
  if (q.inArea === false && q.reason !== 'STORE_NO_LOCATION') return { text: 'Fora da área', tone: 'error' };
  if (q.inArea !== true) return null;
  const eta = q.etaMinutes ? `~${q.etaMinutes[1]} min` : null;
  const fee = q.freeDelivery || q.fee === 0 ? 'Frete grátis' : typeof q.fee === 'number' ? formatMoney(q.fee) : null;
  const text = [eta, fee].filter(Boolean).join(' · ');
  return text ? { text, tone: 'ok' } : null;
}

/** "Onde entregar?" (spec §7.1 AddressSelector): endereços salvos, com prazo/frete da loja em cada um. */
export function AddressPickerSheet({ open, onClose, addresses, selectedId, onPick, onAddNew, storeId, storeName }: AddressPickerSheetProps) {
  const { quotes, loading } = useAddressQuotes(storeId, addresses, open);
  const selectedQuote = selectedId ? quotes[selectedId] : undefined;
  return (
    <Sheet open={open} onClose={onClose} title="Onde entregar?" presentation="bottom">
      {addresses.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>Você ainda não tem endereço salvo.</p>
          <Button leftIcon={<Plus size={18} />} onClick={onAddNew}>Novo endereço</Button>
        </div>
      ) : (
        <>
          {storeName && selectedQuote?.inArea === false && selectedQuote.reason !== 'STORE_NO_LOCATION' && (
            <Alert tone="error" title={`${storeName} não entrega neste endereço`}>Escolha outro endereço da lista.</Alert>
          )}
          <ul className={styles.list}>
            {addresses.map((a) => {
              const id = addressId(a);
              const q = quoteText(quotes[id]);
              const active = id === selectedId;
              return (
                <li key={id}>
                  <button type="button" className={[styles.row, active && styles.active].filter(Boolean).join(' ')} aria-pressed={active} onClick={() => onPick(a)}>
                    <MapPin size={20} strokeWidth={1.75} aria-hidden="true" className={styles.pin} />
                    <span className={styles.body}>
                      <span className={styles.label}>{a.label || 'Endereço'}</span>
                      <span className={styles.address}>{[shortAddress(a), a.neighborhood].filter(Boolean).join(' · ')}</span>
                    </span>
                    {storeId && (loading && !q ? <span className={styles.muted}>Calculando…</span>
                      : q && <span className={styles[q.tone]}>{q.text}</span>)}
                    {active && <Check size={18} strokeWidth={2} aria-hidden="true" className={styles.check} />}
                  </button>
                </li>
              );
            })}
          </ul>
          <Button variant="secondary" leftIcon={<Plus size={18} />} onClick={onAddNew}>Novo endereço</Button>
        </>
      )}
    </Sheet>
  );
}
