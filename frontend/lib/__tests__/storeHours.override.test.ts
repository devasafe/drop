import { openStatus, OperatingHours } from '../storeHours';

// America/Sao_Paulo = UTC-3. 2026-10-21 é quarta-feira; a loja abre 10:00–18:00.
const hours: OperatingHours = { wednesday: { open: '10:00', close: '18:00', closed: false } };
const sp = (hhmm: string) => new Date(`2026-10-21T${hhmm}:00-03:00`);

describe('openStatus: aberta fora do horário (openOverrideUntil)', () => {
  it('override no futuro: aberta, fecha na hora do override e diz overrideUntil', () => {
    const r = openStatus({ isOpen: true, operatingHours: hours, openOverrideUntil: sp('23:59').toISOString() }, sp('20:00'));
    expect(r).toEqual({ open: true, closesAt: '23:59', opensAt: null, overrideUntil: '23:59' });
  });

  it('override vencido: volta a seguir o horário', () => {
    const r = openStatus({ isOpen: true, operatingHours: hours, openOverrideUntil: sp('19:00').toISOString() }, sp('20:00'));
    expect(r).toEqual({ open: false, closesAt: null, opensAt: null });
  });

  it('isOpen=false vence o override', () => {
    const r = openStatus({ isOpen: false, operatingHours: hours, openOverrideUntil: sp('23:59').toISOString() }, sp('20:00'));
    expect(r.open).toBe(false);
  });

  it('pausa vence o override', () => {
    const r = openStatus(
      { isOpen: true, operatingHours: hours, openOverrideUntil: sp('23:59').toISOString(), pausedUntil: sp('21:00').toISOString() },
      sp('20:00'),
    );
    expect(r).toEqual({ open: false, closesAt: null, opensAt: null, pausedBackAt: '21:00' });
  });
});
