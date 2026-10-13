// frontend/components/OperatingHoursEditor.tsx
import { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import api from '../lib/api';
import { Button } from './ui/Button';
import { Switch } from './ui/Switch';
import { useToast } from './ui/Toast';
import { WEEK, dayError, copyToWeekdays, type DayConfig } from '../lib/sellerHours';
import type { DayKey } from '../lib/storeHours';
import { apiErrorMessage } from '../lib/sellerApi';
import styles from './OperatingHoursEditor.module.css';

interface Props {
  storeId: string;
  initialHours?: Partial<Record<DayKey, DayConfig>> | null;
  /** @deprecated D1: abrir/fechar fica em Agora e a pausa na Loja; o editor só cuida dos horários. */
  initialIsOpen?: boolean;
  onSaved?: () => void;
}

const DEFAULT_DAY: DayConfig = { open: '09:00', close: '18:00', closed: false };
const JS_DAYS: DayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export default function OperatingHoursEditor({ storeId, initialHours, onSaved }: Props) {
  const { showToast } = useToast();
  const [hours, setHours] = useState<Record<DayKey, DayConfig>>(() => {
    const r = {} as Record<DayKey, DayConfig>;
    for (const { key } of WEEK) r[key] = { ...(initialHours?.[key] ?? DEFAULT_DAY) };
    return r;
  });
  const [saving, setSaving] = useState(false);
  const today = JS_DAYS[new Date().getDay()];

  const errors = useMemo(() => {
    const e = {} as Record<DayKey, string | null>;
    for (const { key } of WEEK) e[key] = dayError(hours[key]);
    return e;
  }, [hours]);
  const hasError = WEEK.some(({ key }) => !!errors[key]);

  const update = (key: DayKey, patch: Partial<DayConfig>) =>
    setHours((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const save = async () => {
    if (hasError) return;
    setSaving(true);
    try {
      await api.put(`/stores/${storeId}/operating-hours`, { operatingHours: hours });
      showToast('Horários salvos', 'success');
      onSaved?.();
    } catch (e) {
      showToast(apiErrorMessage(e, 'Não foi possível salvar os horários. Tente de novo.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <ul className={styles.list}>
        {WEEK.map(({ key, label }) => {
          const d = hours[key];
          const err = errors[key];
          return (
            <li key={key} className={styles.day}>
              <Switch
                label={label}
                description={key === today ? 'hoje' : undefined}
                checked={!d.closed}
                onChange={(on) => update(key, { closed: !on })}
              />
              {d.closed ? (
                <span className={styles.closed}>Fechado</span>
              ) : (
                <span className={styles.times}>
                  <input
                    type="time"
                    className={styles.time}
                    value={d.open}
                    aria-label={`${label}: abre às`}
                    onChange={(e) => update(key, { open: e.target.value })}
                  />
                  <span aria-hidden="true">–</span>
                  <input
                    type="time"
                    className={styles.time}
                    value={d.close}
                    aria-label={`${label}: fecha às`}
                    onChange={(e) => update(key, { close: e.target.value })}
                  />
                </span>
              )}
              {err && <p role="alert" className={styles.error}>{err}</p>}
            </li>
          );
        })}
      </ul>
      <button type="button" className={styles.copy} onClick={() => setHours((p) => copyToWeekdays(p))}>
        <Copy size={16} aria-hidden="true" />
        Copiar segunda para os dias úteis
      </button>
      <Button onClick={save} loading={saving} disabled={hasError}>Salvar horários</Button>
    </div>
  );
}
