/**
 * "Tela escura à noite" do painel do motoboy (DS v2, fase D2, spec 3.4).
 * Escuro das 18:00 às 05:59 no relógio do aparelho, se a preferência estiver ligada (padrão: ligada).
 * A preferência mora no aparelho (localStorage) para o script do <head> decidir antes da pintura.
 * Toda leitura e escrita tem try/catch: sem armazenamento (aba privada, bloqueio), vale o padrão.
 */
export const NIGHT_PREF_KEY = 'drop.motoboy.nightMode'; // '1' | '0'; ausente = ligado
/** Evento de janela disparado quando a preferência muda (o useRouteTheme recalcula o tema). */
export const NIGHT_PREF_EVENT = 'drop:night-pref';
export const NIGHT_START_HOUR = 18;
export const NIGHT_END_HOUR = 6;

export function readNightPref(): boolean {
  try {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(NIGHT_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeNightPref(on: boolean): void {
  try {
    window.localStorage.setItem(NIGHT_PREF_KEY, on ? '1' : '0');
  } catch {
    /* sem armazenamento: a escolha não persiste e a leitura volta ao padrão */
  }
  try {
    window.dispatchEvent(new Event(NIGHT_PREF_EVENT));
  } catch {
    /* fora do browser */
  }
}

export function isNightHour(d: Date): boolean {
  const h = d.getHours();
  return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
}

/** Milissegundos até a próxima virada (06:00 ou 18:00), na hora local. */
export function msUntilNextBoundary(d: Date): number {
  const next = new Date(d.getTime());
  const h = d.getHours();
  if (h < NIGHT_END_HOUR) next.setHours(NIGHT_END_HOUR, 0, 0, 0);
  else if (h < NIGHT_START_HOUR) next.setHours(NIGHT_START_HOUR, 0, 0, 0);
  else {
    next.setDate(next.getDate() + 1);
    next.setHours(NIGHT_END_HOUR, 0, 0, 0);
  }
  return next.getTime() - d.getTime();
}

export function resolveNightAuto(d: Date, prefOn: boolean): 'light' | 'dark' {
  return prefOn && isNightHour(d) ? 'dark' : 'light';
}
