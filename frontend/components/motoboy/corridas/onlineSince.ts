// "Online · 0h42": desde quando o motoboy está online NESTE aparelho. O servidor só guarda isOnline,
// então a hora de início fica no localStorage (falha de storage = sem tempo, nunca quebra a tela).
export const ONLINE_SINCE_KEY = 'drop.motoboy.onlineSince';

export function readOnlineSince(): number | null {
  try {
    const v = Number(window.localStorage.getItem(ONLINE_SINCE_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function writeOnlineSince(ts: number | null): void {
  try {
    if (ts === null) window.localStorage.removeItem(ONLINE_SINCE_KEY);
    else window.localStorage.setItem(ONLINE_SINCE_KEY, String(ts));
  } catch {
    /* storage bloqueado: segue sem o tempo */
  }
}

export function formatOnlineFor(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')}`;
}
