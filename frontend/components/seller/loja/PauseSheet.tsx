import { useRef, useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import api from '../../../lib/api';
import { payload, apiErrorMessage, formatHour, formatDayMonth, formatFullDate } from '../../../lib/sellerApi';
import { adminPausedText, storeAdminPausedError } from '../../../lib/storeAdminPause';
import blocks from '../../panel/PanelBlocks.module.css';

export type PauseChoice = { minutes: 30 | 60 | 120 } | { untilTomorrow: true };

const OPTIONS: Array<{ label: string; body: PauseChoice }> = [
  { label: '30 minutos', body: { minutes: 30 } },
  { label: '1 hora', body: { minutes: 60 } },
  { label: '2 horas', body: { minutes: 120 } },
  { label: 'Até amanhã', body: { untilTomorrow: true } },
];

/** Pausada enquanto `pausedUntil` estiver no futuro. */
export function isPaused(pausedUntil?: string | null, now: Date = new Date()): boolean {
  if (!pausedUntil) return false;
  const t = new Date(pausedUntil).getTime();
  return Number.isFinite(t) && t > now.getTime();
}

/** "Pausada até 16:05" (hoje) ou "Pausada até 13/10, 08:00" (outro dia), sempre no fuso de São Paulo. */
export function pausedUntilLabel(pausedUntil: string, now: Date = new Date()): string {
  const hhmm = formatHour(pausedUntil);
  if (!hhmm) return 'Loja pausada';
  return formatFullDate(pausedUntil) === formatFullDate(now)
    ? `Pausada até ${hhmm}`
    : `Pausada até ${formatDayMonth(pausedUntil)}, ${hhmm}`;
}

export async function resumeStore(storeId: string): Promise<void> {
  await api.delete(`/stores/${storeId}/pause`);
}

interface Props {
  open: boolean;
  onClose: () => void;
  storeId: string | null | undefined;
  onChanged: (pausedUntil: string | null) => void;
  /** Pedidos já aceitos: seguem até o fim mesmo com a loja pausada. */
  activeOrders?: number;
}

export function PauseSheet({ open, onClose, storeId, onChanged, activeOrders = 0 }: Props) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const sending = useRef(false);

  const choose = async (label: string, body: PauseChoice) => {
    if (!storeId || sending.current) return;
    sending.current = true;
    setBusy(label);
    try {
      const r = await api.put(`/stores/${storeId}/pause`, body);
      const until = payload<{ pausedUntil?: string | null }>(r)?.pausedUntil ?? null;
      onChanged(until);
      showToast(until ? pausedUntilLabel(until) : 'Loja pausada', 'success');
      onClose();
    } catch (e) {
      const byDrop = storeAdminPausedError(e);
      if (byDrop) {
        // O DROP pausou a loja: a pausa do lojista não vale; a tela relê e mostra a faixa.
        showToast(adminPausedText(byDrop.reason), 'error');
        onChanged(null);
        onClose();
      } else {
        showToast(apiErrorMessage(e, 'Não foi possível pausar agora. Tente de novo.'), 'error');
      }
    } finally {
      sending.current = false;
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Pausar a loja" presentation="bottom">
      <div className={blocks.stack}>
        <p className={blocks.sub}>Ninguém consegue pedir até a hora de volta. A loja reabre sozinha.</p>
        {activeOrders > 0 && (
          <p className={blocks.meta}>
            {activeOrders === 1 ? 'O pedido aceito continua.' : `Os ${activeOrders} pedidos aceitos continuam.`}
          </p>
        )}
        {OPTIONS.map((o) => (
          <Button
            key={o.label}
            variant="secondary"
            loading={busy === o.label}
            disabled={!!busy && busy !== o.label}
            onClick={() => choose(o.label, o.body)}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </Sheet>
  );
}

export default PauseSheet;
