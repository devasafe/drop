import logger from '../config/logger';

// Horário de funcionamento da loja (lógica pura, sem I/O). Extraído do storeController.
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/** "Agora" no fuso do Brasil (America/Sao_Paulo). O container roda em UTC, então
 * `getHours()/getDay()` do servidor fechariam a loja no horário errado (à noite,
 * UTC já está no dia seguinte de madrugada → fecha loja aberta). */
export function brazilNow(now: Date = new Date()): { dayIndex: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const val = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dayIndex: WD[val('weekday')] ?? now.getDay(),
    minutes: Number(val('hour')) * 60 + Number(val('minute')),
  };
}

/** Decisão pura de aberto/fechado dado o dia (0=domingo) e o minuto do dia.
 * Exportada p/ teste; `isStoreCurrentlyOpen` a chama com o horário do Brasil. */
export function isOpenAt(
  store: { isOpen?: boolean | null; operatingHours?: any },
  dayIndex: number,
  nowMinutes: number,
): boolean {
  if (!store.isOpen) return false; // toggle manual sobrepõe tudo
  const hours = store.operatingHours;
  if (!hours) return true; // sem horários configurados = sempre aberta

  const dayConfig = (hours as any)[DAYS[dayIndex]] as { open?: string; close?: string; closed?: boolean } | undefined;
  if (!dayConfig) return true;        // dia sem config = aberta
  if (dayConfig.closed) return false; // dia marcado como fechado
  if (!dayConfig.open || !dayConfig.close) return true;

  const timeRegex = /^\d{2}:\d{2}$/;
  if (!timeRegex.test(dayConfig.open) || !timeRegex.test(dayConfig.close)) {
    logger.warn('Formato de horário inválido na loja', { open: dayConfig.open, close: dayConfig.close });
    return true;
  }

  const [openH, openM] = dayConfig.open.split(':').map(Number);
  const [closeH, closeM] = dayConfig.close.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  // Horário que vira a meia-noite (ex.: 18:00–02:00).
  if (closeMinutes <= openMinutes) {
    return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
  }
  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

/** `store` aceita tanto o registro do Prisma quanto o objeto plano usado nas rotas. */
export function isStoreCurrentlyOpen(store: { isOpen?: boolean | null; operatingHours?: any }): boolean {
  const { dayIndex, minutes } = brazilNow();
  return isOpenAt(store, dayIndex, minutes);
}

/**
 * Próximo horário de abertura ('HH:MM') a partir de agora, olhando hoje e os próximos 7 dias.
 * Considera só os horários configurados (ignora o toggle manual `isOpen`, que não tem hora).
 * Retorna undefined se não houver horário configurado que sirva.
 */
export function nextOpeningTime(
  store: { operatingHours?: any },
  dayIndex: number,
  nowMinutes: number,
): string | undefined {
  const hours = store.operatingHours;
  if (!hours) return undefined;
  for (let offset = 0; offset <= 7; offset++) {
    const cfg = (hours as any)[DAYS[(dayIndex + offset) % 7]] as { open?: string; close?: string; closed?: boolean } | undefined;
    if (cfg?.closed) continue;
    // Mesma regra do isOpenAt: dia sem config (ou sem open/close) é "aberta o dia todo",
    // então abre às 00:00. Hoje (offset 0) já passou de 00:00, logo não serve.
    if (!cfg || !cfg.open || !cfg.close) {
      if (offset === 0) continue;
      return '00:00';
    }
    if (!/^\d{2}:\d{2}$/.test(cfg.open)) continue;
    const [h, m] = cfg.open.split(':').map(Number);
    if (offset === 0 && h * 60 + m <= nowMinutes) continue;
    return cfg.open;
  }
  return undefined;
}
