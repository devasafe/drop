import { useState } from 'react';
import api from '../lib/api';
import styles from './OperatingHoursEditor.module.css';
import Icon from './Icon';

const DAYS = [
  { key: 'monday',    label: 'Segunda-feira' },
  { key: 'tuesday',   label: 'Terça-feira' },
  { key: 'wednesday', label: 'Quarta-feira' },
  { key: 'thursday',  label: 'Quinta-feira' },
  { key: 'friday',    label: 'Sexta-feira' },
  { key: 'saturday',  label: 'Sábado' },
  { key: 'sunday',    label: 'Domingo' },
] as const;

type DayKey = typeof DAYS[number]['key'];

interface DayConfig {
  open: string;
  close: string;
  closed: boolean;
}

interface Props {
  storeId: string;
  initialHours?: Partial<Record<DayKey, DayConfig>>;
  initialIsOpen?: boolean;
  onSaved?: () => void;
}

const DEFAULT_DAY: DayConfig = { open: '08:00', close: '22:00', closed: false };

export default function OperatingHoursEditor({ storeId, initialHours, initialIsOpen = true, onSaved }: Props) {
  const [isOpen, setIsOpen] = useState(initialIsOpen);
  const [hours, setHours] = useState<Record<DayKey, DayConfig>>(() => {
    const result = {} as Record<DayKey, DayConfig>;
    for (const { key } of DAYS) {
      result[key] = initialHours?.[key] ?? { ...DEFAULT_DAY };
    }
    return result;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateDay = (day: DayKey, field: keyof DayConfig, value: string | boolean) => {
    setHours(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.put(`/stores/${storeId}/operating-hours`, { isOpen, operatingHours: hours });
      setSaved(true);
      onSaved?.();
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao salvar horários');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Horário de Funcionamento</h3>
          <p className={styles.subtitle}>Defina quando sua loja está disponível para pedidos</p>
        </div>
        <div className={styles.toggleWrap}>
          <span className={styles.toggleLabel}>{isOpen ? 'Aberta' : 'Fechada'}</span>
          <button
            className={`${styles.toggle} ${isOpen ? styles.toggleOn : styles.toggleOff}`}
            onClick={() => setIsOpen(v => !v)}
            type="button"
          >
            <span className={styles.toggleKnob} />
          </button>
        </div>
      </div>

      {!isOpen && (
        <div className={styles.closedBanner}>
          Loja fechada manualmente — nenhum pedido será aceito independentemente do horário.
        </div>
      )}

      <div className={styles.table}>
        {DAYS.map(({ key, label }) => (
          <div key={key} className={`${styles.row} ${hours[key].closed ? styles.rowClosed : ''}`}>
            <div className={styles.dayName}>{label}</div>

            <label className={styles.closedCheck}>
              <input
                type="checkbox"
                checked={hours[key].closed}
                onChange={e => updateDay(key, 'closed', e.target.checked)}
              />
              <span>Fechado</span>
            </label>

            {!hours[key].closed && (
              <div className={styles.timeRow}>
                <input
                  type="time"
                  value={hours[key].open}
                  onChange={e => updateDay(key, 'open', e.target.value)}
                  className={styles.timeInput}
                />
                <span className={styles.timeSep}>até</span>
                <input
                  type="time"
                  value={hours[key].close}
                  onChange={e => updateDay(key, 'close', e.target.value)}
                  className={styles.timeInput}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        {saved && <span className={styles.savedMsg}><Icon name="check-circle" size={14} /> Salvo!</span>}
        <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar horários'}
        </button>
      </div>
    </div>
  );
}
