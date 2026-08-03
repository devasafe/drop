import { isOpenAt } from '../controllers/storeController';

// dayIndex: 0=domingo ... 6=sábado. nowMinutes = hora*60 + min.
describe('isOpenAt', () => {
  it('isOpen=false → fechada (toggle manual)', () => {
    expect(isOpenAt({ isOpen: false }, 1, 12 * 60)).toBe(false);
  });
  it('sem operatingHours → aberta', () => {
    expect(isOpenAt({ isOpen: true }, 1, 12 * 60)).toBe(true);
  });
  it('dentro do horário do dia → aberta', () => {
    const hours = { monday: { open: '08:00', close: '22:00' } };
    expect(isOpenAt({ isOpen: true, operatingHours: hours }, 1, 12 * 60)).toBe(true);
  });
  it('cenário do bug: 23:00 (BR) numa loja 08:00–22:00 → fechada de verdade, mas 21:00 → aberta', () => {
    const hours = { monday: { open: '08:00', close: '22:00' } };
    expect(isOpenAt({ isOpen: true, operatingHours: hours }, 1, 23 * 60)).toBe(false);
    expect(isOpenAt({ isOpen: true, operatingHours: hours }, 1, 21 * 60)).toBe(true);
  });
  it('dia marcado como fechado', () => {
    const hours = { sunday: { closed: true } };
    expect(isOpenAt({ isOpen: true, operatingHours: hours }, 0, 12 * 60)).toBe(false);
  });
  it('horário que vira a meia-noite (18:00–02:00)', () => {
    const hours = { friday: { open: '18:00', close: '02:00' } };
    expect(isOpenAt({ isOpen: true, operatingHours: hours }, 5, 23 * 60)).toBe(true); // 23:00
    expect(isOpenAt({ isOpen: true, operatingHours: hours }, 5, 1 * 60)).toBe(true);  // 01:00
    expect(isOpenAt({ isOpen: true, operatingHours: hours }, 5, 3 * 60)).toBe(false); // 03:00
    expect(isOpenAt({ isOpen: true, operatingHours: hours }, 5, 12 * 60)).toBe(false); // 12:00
  });
});
