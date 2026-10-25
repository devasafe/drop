import { DARK_PREF_KEY, DARK_PREF_EVENT, readDarkPref, writeDarkPref, resolveMotoboyTheme } from '../nightTheme';

afterEach(() => { localStorage.clear(); jest.restoreAllMocks(); });

describe('modo escuro manual do motoboy', () => {
  it('padrão claro; "1" liga o escuro; "0" volta ao claro', () => {
    expect(readDarkPref()).toBe(false);
    localStorage.setItem(DARK_PREF_KEY, '1');
    expect(readDarkPref()).toBe(true);
    localStorage.setItem(DARK_PREF_KEY, '0');
    expect(readDarkPref()).toBe(false);
  });

  it('não depende da hora: a preferência decide sozinha', () => {
    expect(resolveMotoboyTheme(true)).toBe('dark');
    expect(resolveMotoboyTheme(false)).toBe('light');
  });

  it('a preferência antiga "Tela escura à noite" não vale mais (todo mundo começa no claro)', () => {
    localStorage.setItem('drop.motoboy.nightMode', '1');
    expect(readDarkPref()).toBe(false);
  });

  it('leitura que falha (aba privada, armazenamento bloqueado) vale o padrão: claro', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    expect(readDarkPref()).toBe(false);
  });

  it('escrita grava e avisa a tela (evento), mesmo quando o armazenamento falha', () => {
    const ouvinte = jest.fn();
    window.addEventListener(DARK_PREF_EVENT, ouvinte);
    writeDarkPref(true);
    expect(localStorage.getItem(DARK_PREF_KEY)).toBe('1');
    expect(ouvinte).toHaveBeenCalledTimes(1);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    expect(() => writeDarkPref(false)).not.toThrow();
    expect(ouvinte).toHaveBeenCalledTimes(2);
    window.removeEventListener(DARK_PREF_EVENT, ouvinte);
  });
});
