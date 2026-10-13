import { openStatus, OperatingHours } from '../storeHours';

// Datas em UTC fixas; America/Sao_Paulo = UTC-3 (sem horário de verão desde 2019).
// 2026-10-13 é terça-feira.
const noturno: OperatingHours = {
  monday: { open: '18:00', close: '02:00', closed: false },
  tuesday: { open: '18:00', close: '02:00', closed: false },
  wednesday: { open: '18:00', close: '02:00', closed: false },
};
const comercial: OperatingHours = { tuesday: { open: '09:00', close: '18:00', closed: false } };

describe('openStatus: horário que vira a meia-noite (igual ao backend isOpenAt)', () => {
  it('18:00-02:00 às 20:00 SP: aberta, fecha 02:00', () => {
    const r = openStatus({ operatingHours: noturno }, new Date('2026-10-13T23:00:00Z'));
    expect(r.open).toBe(true);
    expect(r.closesAt).toBe('02:00');
  });

  it('18:00-02:00 às 01:00 SP: aberta (backend usa a config do dia atual, sem olhar o dia anterior)', () => {
    const r = openStatus({ operatingHours: noturno }, new Date('2026-10-13T04:00:00Z'));
    expect(r.open).toBe(true);
    expect(r.closesAt).toBe('02:00');
  });

  it('18:00-02:00 às 03:00 SP: fechada, abre 18:00', () => {
    const r = openStatus({ operatingHours: noturno }, new Date('2026-10-13T06:00:00Z'));
    expect(r.open).toBe(false);
    expect(r.opensAt).toBe('18:00');
  });

  it('09:00-18:00 às 12:00 SP: aberta (caso normal)', () => {
    const r = openStatus({ operatingHours: comercial }, new Date('2026-10-13T15:00:00Z'));
    expect(r).toMatchObject({ open: true, closesAt: '18:00' });
  });

  it('segue o fuso de SP, não o do aparelho: 02:30Z = 23:30 SP de segunda', () => {
    const r = openStatus({ operatingHours: noturno }, new Date('2026-10-13T02:30:00Z'));
    expect(r.open).toBe(true);
    expect(r.closesAt).toBe('02:00');
    // dia certo: segunda (SP) e não terça (UTC) -> só segunda tem horário
    const soSegunda: OperatingHours = { monday: { open: '18:00', close: '02:00', closed: false }, tuesday: { open: '09:00', close: '10:00', closed: false } };
    expect(openStatus({ operatingHours: soSegunda }, new Date('2026-10-13T02:30:00Z')).open).toBe(true);
  });

  it('formato inválido ("abc" ou "9:00"): aberta, como o backend', () => {
    const now = new Date('2026-10-13T15:00:00Z');
    for (const [open, close] of [['abc', '18:00'], ['9:00', '18:00'], ['09:00', '6pm']]) {
      const r = openStatus({ operatingHours: { tuesday: { open, close, closed: false } } }, now);
      expect(r).toEqual({ open: true, closesAt: null, opensAt: null });
    }
  });

  it('dia closed com open/close vazios: fechada (closed vem antes, como no backend)', () => {
    const r = openStatus({ operatingHours: { tuesday: { open: '', close: '', closed: true } } }, new Date('2026-10-13T15:00:00Z'));
    expect(r.open).toBe(false);
  });
});
