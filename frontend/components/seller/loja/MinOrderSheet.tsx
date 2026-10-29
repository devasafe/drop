import { useEffect, useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { useToast } from '../../ui/Toast';
import api from '../../../lib/api';
import { formatMoney } from '../../../lib/money';
import { apiErrorMessage, parseMoneyInput } from '../../../lib/sellerApi';
import blocks from '../../panel/PanelBlocks.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  storeId: string | null | undefined;
  /** Mínimo da própria loja (null = o da DROP). */
  current: number | null;
  /** Mínimo da DROP: a loja só sobe dele. */
  platformMin: number;
  onSaved: () => void;
}

const toInput = (n: number) => n.toFixed(2).replace('.', ',');

/** Pedido mínimo da loja, só nos produtos. Vazio volta ao mínimo da DROP. */
export function MinOrderSheet({ open, onClose, storeId, current, platformMin, onSaved }: Props) {
  const { showToast } = useToast();
  const [raw, setRaw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setRaw(current != null ? toInput(current) : ''); setError(''); }
  }, [open, current]);

  const empty = raw.trim() === '';
  const value = empty ? null : parseMoneyInput(raw);
  const invalid = value !== null && !Number.isFinite(value);
  const belowFloor = value !== null && Number.isFinite(value) && Math.round(value * 100) < Math.round(platformMin * 100);
  const fieldError = invalid ? 'Valor inválido. Ex.: 20,00'
    : belowFloor ? `Use ${formatMoney(platformMin)} ou mais (mínimo da DROP).`
    : undefined;

  const save = async () => {
    if (!storeId || fieldError) return;
    setSaving(true);
    setError('');
    try {
      await api.put(`/stores/${storeId}`, { minOrderValue: value });
      showToast('Pedido mínimo salvo', 'success');
      onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível salvar o pedido mínimo. Tente de novo.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Pedido mínimo" presentation="bottom">
      <div className={blocks.stack}>
        <p className={blocks.sub}>
          {`Valor mínimo em produtos para pedir na sua loja. A entrega não conta. O mínimo da DROP é ${formatMoney(platformMin)}.`}
        </p>
        <Input
          label="Pedido mínimo (R$)"
          value={raw}
          onChange={(v) => setRaw(v.replace(/[^\d.,]/g, ''))}
          inputMode="decimal"
          placeholder={toInput(platformMin)}
          hint="Deixe vazio para usar o mínimo da DROP."
          error={fieldError}
        />
        {error && <p role="alert" className={blocks.errText}>{error}</p>}
        <Button onClick={save} loading={saving} disabled={!!fieldError || !storeId}>Salvar</Button>
      </div>
    </Sheet>
  );
}

export default MinOrderSheet;
