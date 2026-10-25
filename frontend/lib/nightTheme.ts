/**
 * Modo escuro do painel do motoboy: manual, independente da hora. Padrão: claro.
 * A preferência mora no aparelho (localStorage) para o script do <head> decidir antes da pintura.
 * Chave nova (a antiga "drop.motoboy.nightMode" era do automático 18h–6h e não vale mais): todo mundo
 * começa no claro. Toda leitura e escrita tem try/catch: sem armazenamento (aba privada, bloqueio), vale o padrão.
 */
export const DARK_PREF_KEY = 'drop.motoboy.darkMode'; // '1' | '0'; ausente = claro
/** Evento de janela disparado quando a preferência muda (o useRouteTheme reaplica o tema). */
export const DARK_PREF_EVENT = 'drop:dark-pref';

export function readDarkPref(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(DARK_PREF_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeDarkPref(on: boolean): void {
  try {
    window.localStorage.setItem(DARK_PREF_KEY, on ? '1' : '0');
  } catch {
    /* sem armazenamento: a escolha não persiste e a leitura volta ao padrão */
  }
  try {
    window.dispatchEvent(new Event(DARK_PREF_EVENT));
  } catch {
    /* fora do browser */
  }
}

export function resolveMotoboyTheme(darkOn: boolean): 'light' | 'dark' {
  return darkOn ? 'dark' : 'light';
}
