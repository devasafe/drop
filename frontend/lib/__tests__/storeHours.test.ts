import { openStatus } from '../storeHours';

const seg = new Date(2026, 9, 12, 14, 0); // segunda-feira, 14:00
const hours = { monday: { open: '09:00', close: '20:00', closed: false }, tuesday: { open: '09:00', close: '18:00', closed: false } };

it('aberta: diz até quando', () => {
  expect(openStatus({ isOpen: true, operatingHours: hours }, seg)).toEqual({ open: true, closesAt: '20:00', opensAt: null });
});
it('antes de abrir: fechada, abre hoje', () => {
  expect(openStatus({ isOpen: true, operatingHours: hours }, new Date(2026, 9, 12, 7, 0))).toEqual({ open: false, closesAt: null, opensAt: '09:00' });
});
it('isOpen=false manda; sem horário cadastrado vale isOpen', () => {
  expect(openStatus({ isOpen: false, operatingHours: hours }, seg).open).toBe(false);
  expect(openStatus({ isOpen: true }, seg)).toEqual({ open: true, closesAt: null, opensAt: null });
});
