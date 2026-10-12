/**
 * D1 · P2.4 — regras puras da pausa da loja (sem banco).
 * "Aberta agora" = isOpen && (pausedUntil == null || pausedUntil <= agora). Sem job: a pausa vence na leitura.
 * "Até amanhã" = abertura do próximo dia pelo operatingHours; sem horário, dia seguinte às 08:00 em São Paulo.
 */
import { isStorePaused, isStoreOpenNow, isStoreOpenWithHoursNow, pauseUntilTomorrowAt } from '../utils/storeOpen';

// Segunda-feira, 12/10/2026, 15:00 em São Paulo (18:00 UTC).
const NOW = new Date('2026-10-12T15:00:00-03:00');
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);
const ALL_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const everyDay = (open: string, close: string) => Object.fromEntries(ALL_DAYS.map((d) => [d, { open, close }]));

describe('isStorePaused', () => {
  it('sem pausa, pausa no passado ou exatamente agora: não está pausada', () => {
    expect(isStorePaused({}, NOW)).toBe(false);
    expect(isStorePaused({ pausedUntil: null }, NOW)).toBe(false);
    expect(isStorePaused({ pausedUntil: min(-1) }, NOW)).toBe(false);
    expect(isStorePaused({ pausedUntil: NOW }, NOW)).toBe(false);
  });

  it('pausa no futuro: pausada', () => {
    expect(isStorePaused({ pausedUntil: min(1) }, NOW)).toBe(true);
  });

  it('data inválida não pausa (fail open só para leitura; o checkout usa o mesmo helper)', () => {
    expect(isStorePaused({ pausedUntil: new Date('x') }, NOW)).toBe(false);
  });
});

describe('isStoreOpenNow', () => {
  it('toggle desligado: fechada, com ou sem pausa', () => {
    expect(isStoreOpenNow({ isOpen: false }, NOW)).toBe(false);
    expect(isStoreOpenNow({ isOpen: false, pausedUntil: min(30) }, NOW)).toBe(false);
  });

  it('toggle ligado: aberta sem pausa, fechada durante a pausa, aberta quando a pausa vence', () => {
    expect(isStoreOpenNow({ isOpen: true }, NOW)).toBe(true);
    expect(isStoreOpenNow({ isOpen: true, pausedUntil: min(30) }, NOW)).toBe(false);
    expect(isStoreOpenNow({ isOpen: true, pausedUntil: min(-30) }, NOW)).toBe(true);
  });
});

describe('isStoreOpenWithHoursNow', () => {
  it('soma o horário de funcionamento (fuso de São Paulo)', () => {
    expect(isStoreOpenWithHoursNow({ isOpen: true, operatingHours: everyDay('08:00', '14:00') }, NOW)).toBe(false);
    expect(isStoreOpenWithHoursNow({ isOpen: true, operatingHours: everyDay('08:00', '22:00') }, NOW)).toBe(true);
    expect(isStoreOpenWithHoursNow({ isOpen: true, operatingHours: everyDay('08:00', '22:00'), pausedUntil: min(60) }, NOW)).toBe(false);
    expect(isStoreOpenWithHoursNow({ isOpen: true, operatingHours: null }, NOW)).toBe(true);
  });
});

describe('pauseUntilTomorrowAt', () => {
  it('sem horário: amanhã às 08:00 de São Paulo', () => {
    expect(pauseUntilTomorrowAt({ operatingHours: null }, NOW).toISOString()).toBe('2026-10-13T11:00:00.000Z');
  });

  it('com horário: a abertura de amanhã', () => {
    const hours = { ...everyDay('09:00', '18:00'), tuesday: { open: '10:30', close: '22:00' } };
    expect(pauseUntilTomorrowAt({ operatingHours: hours }, NOW).toISOString()).toBe('2026-10-13T13:30:00.000Z');
  });

  it('amanhã fechado: pula para o próximo dia aberto', () => {
    const hours = { ...everyDay('09:00', '18:00'), tuesday: { closed: true } };
    expect(pauseUntilTomorrowAt({ operatingHours: hours }, NOW).toISOString()).toBe('2026-10-14T12:00:00.000Z');
  });

  it('amanhã sem configuração (aberto o dia todo): 08:00', () => {
    const hours = { monday: { open: '09:00', close: '18:00' } };
    expect(pauseUntilTomorrowAt({ operatingHours: hours }, NOW).toISOString()).toBe('2026-10-13T11:00:00.000Z');
  });

  it('23:30 em São Paulo (UTC já é terça): "amanhã" continua sendo terça', () => {
    const late = new Date('2026-10-12T23:30:00-03:00');
    expect(pauseUntilTomorrowAt({ operatingHours: null }, late).toISOString()).toBe('2026-10-13T11:00:00.000Z');
  });

  it('semana inteira fechada: cai em amanhã às 08:00', () => {
    const hours = Object.fromEntries(ALL_DAYS.map((d) => [d, { closed: true }]));
    expect(pauseUntilTomorrowAt({ operatingHours: hours }, NOW).toISOString()).toBe('2026-10-13T11:00:00.000Z');
  });
});
