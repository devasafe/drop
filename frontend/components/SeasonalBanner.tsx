import { useSeasonalTheme } from '../contexts/SeasonalThemeContext';
import Icon, { IconName } from './Icon';
import styles from './SeasonalBanner.module.css';

const BANNERS: Record<string, { icon: IconName; message: string }> = {
  natal:     { icon: 'tree',    message: 'Feliz Natal! Aproveite as promoções especiais de fim de ano.' },
  pascoa:    { icon: 'egg',     message: 'Feliz Páscoa! Encontre os melhores produtos para celebrar.' },
  junina:    { icon: 'tent',    message: 'Arraiá DROP! Promoções caipiras pra você aproveitar.' },
  halloween: { icon: 'pumpkin', message: 'Halloween chegou! Ofertas assustadoramente boas.' },
};

export default function SeasonalBanner() {
  const { theme } = useSeasonalTheme();
  const banner = BANNERS[theme];

  if (!banner) return null;

  return (
    <div className={`${styles.banner} ${styles[`banner_${theme}`]}`}>
      <span className={styles.emoji}><Icon name={banner.icon} size={20} color="currentColor" /></span>
      <span className={styles.message}>{banner.message}</span>
      <span className={styles.emoji}><Icon name={banner.icon} size={20} color="currentColor" /></span>
    </div>
  );
}
