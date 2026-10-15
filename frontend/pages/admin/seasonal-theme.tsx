import { useEffect, useState } from 'react';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { useSeasonalTheme } from '../../contexts/SeasonalThemeContext';
import { adminErrorMessage } from '../../lib/adminErrors';
import { formatMoney } from '../../lib/money';
import styles from '../../components/admin/tema/SeasonalTheme.module.css';

/**
 * Tema sazonal (D3a, tela 25). Escolhe, vê a prévia e aplica: PUT /settings/platform-config { seasonalTheme }.
 * A cor da amostra e da prévia vem do próprio tema (globals.css: .seasonal-preview.theme-*), sem cor na tela.
 */
type ThemeId = 'none' | 'natal' | 'pascoa' | 'junina' | 'halloween';

const THEMES: { id: ThemeId; name: string; hint: string; banner: string }[] = [
  { id: 'none', name: 'Nenhum', hint: 'Roxo padrão do DROP', banner: 'Ofertas de hoje' },
  { id: 'natal', name: 'Natal', hint: 'Dezembro', banner: 'Natal no DROP' },
  { id: 'pascoa', name: 'Páscoa', hint: 'Março e abril', banner: 'Páscoa no DROP' },
  { id: 'junina', name: 'Festa junina', hint: 'Junho', banner: 'Arraiá no DROP' },
  { id: 'halloween', name: 'Halloween', hint: 'Outubro', banner: 'Halloween no DROP' },
];

const themeOf = (id: ThemeId) => THEMES.find((t) => t.id === id) ?? THEMES[0];

export default function SeasonalThemePage() {
  return (
    <ProtectedRoute required_permission="theme:edit">
      <AdminShell title="Tema sazonal">
        <TemaBody />
      </AdminShell>
    </ProtectedRoute>
  );
}

function TemaBody() {
  const { theme: activeTheme, setTheme } = useSeasonalTheme();
  const { showToast } = useToast();
  const [selected, setSelected] = useState<ThemeId>(activeTheme);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(activeTheme);
  }, [activeTheme]);

  const apply = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put('/settings/platform-config', { seasonalTheme: selected });
      setTheme(selected);
      showToast(selected === 'none' ? 'O app voltou ao tema padrão' : `Tema ${themeOf(selected).name} aplicado`, 'success');
    } catch (err) {
      setError(adminErrorMessage(err, 'Erro ao salvar tema'));
    } finally {
      setSaving(false);
    }
  };

  const chosen = themeOf(selected);
  const label = selected === 'none'
    ? (activeTheme === 'none' ? 'Aplicar agora' : 'Voltar ao padrão')
    : `Aplicar ${chosen.name} agora`;

  return (
    <div className={styles.layout}>
      <div className={styles.options}>
        <p className={styles.status}>Atual: <strong>{themeOf(activeTheme).name}</strong></p>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Tema do app do cliente</legend>
          {THEMES.map((t) => (
            <label key={t.id} className={[styles.option, selected === t.id && styles.optionOn].filter(Boolean).join(' ')}>
              <input
                type="radio"
                name="tema-sazonal"
                value={t.id}
                checked={selected === t.id}
                onChange={() => setSelected(t.id)}
                className={styles.radio}
              />
              <span className={`${styles.swatch} seasonal-preview theme-${t.id}`} aria-hidden="true" />
              <span className={styles.optionText}>
                <span className={styles.optionName}>{t.name}</span>
                <span className={styles.optionHint}>{t.hint}</span>
              </span>
              {activeTheme === t.id && <span className={styles.activeTag}>Ativo</span>}
            </label>
          ))}
        </fieldset>

        <Alert tone="info" title="Muda só a cor de ação e os destaques">
          Status, preço e alertas continuam nas cores de sempre, para não confundir.
        </Alert>
        {error && <Alert tone="error" title="O tema não foi aplicado">{error}</Alert>}

        <div className={styles.actions}>
          <Button onClick={apply} loading={saving} disabled={selected === activeTheme}>{label}</Button>
        </div>
      </div>

      <section className={styles.previewCol} aria-label={`Prévia · ${chosen.name}`}>
        <p className={styles.previewCap}>Prévia · {chosen.name}</p>
        <div className={`${styles.phone} seasonal-preview theme-${selected}`} data-testid="seasonal-preview">
          <div className={styles.search}>Buscar produtos e lojas</div>
          <div className={styles.banner}>
            <strong className={styles.bannerTitle}>{chosen.banner}</strong>
            <span className={styles.bannerSub}>Presentes que chegam hoje</span>
          </div>
          <div className={styles.chips}>
            <span className={styles.chipOn}>Ofertas</span>
            <span className={styles.chip}>Até {formatMoney(50)}</span>
          </div>
          <div className={styles.product}>
            <div className={styles.photo} aria-hidden="true" />
            <span className={styles.productName}>Kit presente papelaria</span>
            <span className={styles.price}>{formatMoney(59.9)}</span>
          </div>
          <div className={styles.cart}>
            <span>Ver sacola · 1 item</span>
            <span>{formatMoney(59.9)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
