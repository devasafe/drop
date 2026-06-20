import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useSeasonalTheme } from '../../contexts/SeasonalThemeContext';
import styles from './SeasonalTheme.module.css';
import Icon, { IconName } from '../../components/Icon';

type ThemeId = 'none' | 'natal' | 'pascoa' | 'junina' | 'halloween';

const THEMES: { id: ThemeId; name: string; icon: IconName; description: string; primary: string; secondary: string }[] = [
  { id: 'none',      name: 'Nenhum',        icon: 'palette',  description: 'Tema padrão DROP',               primary: '#6C2BD9', secondary: '#8B5CF6' },
  { id: 'natal',     name: 'Natal',         icon: 'tree',     description: 'Dezembro — cores de fim de ano', primary: '#B91C1C', secondary: '#EF4444' },
  { id: 'pascoa',    name: 'Páscoa',        icon: 'egg',      description: 'Março/Abril — tons pastéis',     primary: '#7C3AED', secondary: '#A78BFA' },
  { id: 'junina',    name: 'Festa Junina',  icon: 'tent',     description: 'Junho — cores quentes do arraial', primary: '#B45309', secondary: '#F59E0B' },
  { id: 'halloween', name: 'Halloween',     icon: 'pumpkin',  description: 'Outubro — laranja e escuro',      primary: '#C2410C', secondary: '#FB923C' },
];

export default function SeasonalThemePage() {
  const { theme: activeTheme, setTheme } = useSeasonalTheme();
  const [selected, setSelected] = useState<ThemeId>(activeTheme);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSelected(activeTheme);
  }, [activeTheme]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await api.put('/settings/platform-config', { seasonalTheme: selected });
      setTheme(selected);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao salvar tema');
    }
    setSaving(false);
  };

  return (
    <ProtectedRoute required_permission="theme:edit">
      <div className={styles.page}>
        <div className={styles.container}>

          <div className={styles.header}>
            <h1 className={styles.title}><Icon name="palette" size={24} /> Tema Sazonal</h1>
            <p className={styles.subtitle}>
              Ative um tema visual para datas comemorativas. As cores de destaque do site serão alteradas automaticamente para todos os usuários.
            </p>
          </div>

          <div className={styles.grid}>
            {THEMES.map(theme => (
              <button
                key={theme.id}
                onClick={() => setSelected(theme.id)}
                className={`${styles.card} ${selected === theme.id ? styles.cardActive : ''}`}
              >
                {/* Prévia de cor */}
                <div
                  className={styles.colorPreview}
                  style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}
                >
                  <span className={styles.previewEmoji}><Icon name={theme.icon} size={32} color="#fff" /></span>
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.cardName}>{theme.name}</div>
                  <div className={styles.cardDesc}>{theme.description}</div>
                  <div className={styles.colorDots}>
                    <span className={styles.colorDot} style={{ background: theme.primary }} />
                    <span className={styles.colorDot} style={{ background: theme.secondary }} />
                  </div>
                </div>

                {selected === theme.id && (
                  <div className={styles.checkmark}>✓</div>
                )}
              </button>
            ))}
          </div>

          <div className={styles.actions}>
            {error && <div className={styles.errorMsg}>{error}</div>}
            {saved && <div className={styles.successMsg}>✓ Tema aplicado com sucesso!</div>}
            <button
              onClick={handleSave}
              disabled={saving || selected === activeTheme}
              className={styles.btnSave}
            >
              {saving ? 'Salvando...' : 'Aplicar Tema'}
            </button>
          </div>

        </div>
      </div>
    </ProtectedRoute>
  );
}
