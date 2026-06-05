import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import api from '../lib/api';
import { useSocket } from './SocketContext';

type SeasonalTheme = 'none' | 'natal' | 'pascoa' | 'junina' | 'halloween';

interface SeasonalThemeContextValue {
  theme: SeasonalTheme;
  setTheme: (theme: SeasonalTheme) => void;
}

const SeasonalThemeContext = createContext<SeasonalThemeContextValue>({
  theme: 'none',
  setTheme: () => {},
});

const THEME_CLASSES: SeasonalTheme[] = ['natal', 'pascoa', 'junina', 'halloween'];

function applyTheme(theme: SeasonalTheme) {
  if (typeof document === 'undefined') return;
  THEME_CLASSES.forEach(t => document.body.classList.remove(`theme-${t}`));
  if (theme !== 'none') {
    document.body.classList.add(`theme-${theme}`);
  }
}

function SeasonalThemeProviderInner({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<SeasonalTheme>('none');
  const { on } = useSocket();

  // Carrega tema inicial do backend
  useEffect(() => {
    let cancelled = false;
    api.get('/settings/platform-config')
      .then(({ data }) => {
        if (!cancelled) {
          const t = (data?.seasonalTheme || 'none') as SeasonalTheme;
          setThemeState(t);
          applyTheme(t);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Atualiza em tempo real via socket
  useEffect(() => {
    const unsubscribe = on('theme:updated', (data: { seasonalTheme: SeasonalTheme }) => {
      const t = data?.seasonalTheme || 'none';
      setThemeState(t);
      applyTheme(t);
    });
    return () => unsubscribe();
  }, [on]);

  const setTheme = (newTheme: SeasonalTheme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
  };

  return (
    <SeasonalThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </SeasonalThemeContext.Provider>
  );
}

export function SeasonalThemeProvider({ children }: { children: ReactNode }) {
  return <SeasonalThemeProviderInner>{children}</SeasonalThemeProviderInner>;
}

export function useSeasonalTheme() {
  return useContext(SeasonalThemeContext);
}
