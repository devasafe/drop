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

/** Loja como as regras de horário a leem: registro do Prisma ou objeto plano das rotas. */
export interface StoreHoursInput {
  isOpen?: boolean | null;
  operatingHours?: any;
  /** D1: pausa; enquanto no futuro, a loja está fechada (vence o override). */
  pausedUntil?: Date | string | null;
  /** Aberta fora do horário até este instante (o lojista abriu na mão). */
  openOverrideUntil?: Date | string | null;
}

/** `value` é um instante válido depois de `now`. */
const isFuture = (value: Date | string | null | undefined, now: Date): boolean => {
  if (!value) return false;
  const t = new Date(value).getTime();
  return Number.isFinite(t) && t > now.getTime();
};

/** Aberta pelo horário cadastrado no dia (0=domingo) e minuto do dia; ignora isOpen, pausa e override. */
function isWithinHours(hours: any, dayIndex: number, nowMinutes: number): boolean {
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

/**
 * Decisão pura de aberto/fechado dado o dia (0=domingo) e o minuto do dia (SP), na ordem:
 * pausada → fechada; isOpen=false → fechada; override no futuro → aberta; senão, o horário.
 * `now` é o instante comparado com a pausa e o override (o mesmo de onde saíram dia e minuto).
 * Exportada p/ teste; `isStoreCurrentlyOpen` a chama com o horário do Brasil.
 */
export function isOpenAt(
  store: StoreHoursInput,
  dayIndex: number,
  nowMinutes: number,
  now: Date = new Date(),
): boolean {
  if (isFuture(store.pausedUntil, now)) return false;
  if (!store.isOpen) return false; // toggle manual sobrepõe o horário
  if (isFuture(store.openOverrideUntil, now)) return true; // aberta fora do horário
  return isWithinHours(store.operatingHours, dayIndex, nowMinutes);
}

/** `store` aceita tanto o registro do Prisma quanto o objeto plano usado nas rotas. */
export function isStoreCurrentlyOpen(store: StoreHoursInput, now: Date = new Date()): boolean {
  const { dayIndex, minutes } = brazilNow(now);
  return isOpenAt(store, dayIndex, minutes, now);
}

/**
 * Até quando vale "abrir agora" fora do horário (`Store.openOverrideUntil`), ou null se pelo
 * horário a loja já estaria aberta. Antes da abertura de hoje: até ela (e daí o horário segue).
 * Já fechou hoje, dia fechado ou sem abertura que sirva: até 23:59:59 de hoje em São Paulo.
 */
export function openOverrideUntilFor(store: { operatingHours?: any }, now: Date = new Date()): Date | null {
  const { dayIndex, minutes } = brazilNow(now);
  if (isWithinHours(store.operatingHours, dayIndex, minutes)) return null;
  const today = (store.operatingHours as any)?.[DAYS[dayIndex]] as { open?: string; closed?: boolean } | undefined;
  if (today && !today.closed && typeof today.open === 'string' && /^\d{2}:\d{2}$/.test(today.open)) {
    const [h, m] = today.open.split(':').map(Number);
    if (minutes < h * 60 + m) return atBrazilTime(now, `${today.open}:00`);
  }
  return atBrazilTime(now, '23:59:59');
}

/** `hh:mm:ss` de hoje em São Paulo, como Date. Offset fixo -03:00: sem horário de verão desde 2019. */
function atBrazilTime(now: Date, hhmmss: string): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return new Date(`${ymd}T${hhmmss}-03:00`);
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
