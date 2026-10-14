import {
  NIGHT_PREF_KEY, NIGHT_PREF_EVENT, readNightPref, writeNightPref, isNightHour, msUntilNextBoundary, resolveNightAuto,
} from '../nightTheme';

// Hora local do aparelho: new Date(ano, mês, dia, h, m) é local em qualquer fuso do runner.
const at = (h: number, m: number) => new Date(2026, 9, 14, h, m, 0, 0);
const MIN = 60_000;
const H = 60 * MIN;

afterEach(() => { localStorage.clear(); jest.restoreAllMocks(); });

describe('relógio da noite (18:00 → 05:59)', () => {
  it.each([[17, 59, false], [18, 0, true], [23, 59, true], [0, 0, true], [5, 59, true], [6, 0, false], [12, 0, false]])(
    '%i:%i é noite? %p', (h, m, esperado) => { expect(isNightHour(at(h, m))).toBe(esperado); },
  );

  it('preferência ligada segue o relógio; desligada é sempre claro', () => {
    expect(resolveNightAuto(at(17, 59), true)).toBe('light');
    expect(resolveNightAuto(at(18, 0), true)).toBe('dark');
    expect(resolveNightAuto(at(5, 59), true)).toBe('dark');
    expect(resolveNightAuto(at(6, 0), true)).toBe('light');
    for (const [h, m] of [[17, 59], [18, 0], [5, 59], [6, 0]]) expect(resolveNightAuto(at(h, m), false)).toBe('light');
  });

  it('tempo até a próxima virada (06:00 ou 18:00)', () => {
    expect(msUntilNextBoundary(at(17, 59))).toBe(MIN);
    expect(msUntilNextBoundary(at(18, 0))).toBe(12 * H);
    expect(msUntilNextBoundary(at(5, 59))).toBe(MIN);
    expect(msUntilNextBoundary(at(6, 0))).toBe(12 * H);
    expect(msUntilNextBoundary(at(23, 30))).toBe(6 * H + 30 * MIN);
  });
});

describe('preferência "Tela escura à noite" no aparelho', () => {
  it('padrão ligado; "0" desliga; "1" liga', () => {
    expect(readNightPref()).toBe(true);
    localStorage.setItem(NIGHT_PREF_KEY, '0');
    expect(readNightPref()).toBe(false);
    localStorage.setItem(NIGHT_PREF_KEY, '1');
    expect(readNightPref()).toBe(true);
  });

  it('leitura que falha (aba privada, armazenamento bloqueado) vale o padrão: ligado', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    expect(readNightPref()).toBe(true);
  });

  it('escrita grava e avisa a tela (evento), mesmo quando o armazenamento falha', () => {
    const ouvinte = jest.fn();
    window.addEventListener(NIGHT_PREF_EVENT, ouvinte);
    writeNightPref(false);
    expect(localStorage.getItem(NIGHT_PREF_KEY)).toBe('0');
    expect(ouvinte).toHaveBeenCalledTimes(1);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    expect(() => writeNightPref(true)).not.toThrow();
    expect(ouvinte).toHaveBeenCalledTimes(2);
    window.removeEventListener(NIGHT_PREF_EVENT, ouvinte);
  });
});
