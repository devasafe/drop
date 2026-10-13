import { summarizeHours, dayError, copyToWeekdays, WEEK } from '../sellerHours';

const h = (open: string, close: string) => ({ open, close, closed: false });
const fechado = { open: '09:00', close: '18:00', closed: true };

test('agrupa dias seguidos com o mesmo horário', () => {
  expect(summarizeHours({
    monday: h('09:00', '22:00'), tuesday: h('09:00', '22:00'), wednesday: h('09:00', '22:00'),
    thursday: h('09:00', '22:00'), friday: h('09:00', '22:00'), saturday: h('10:00', '18:00'), sunday: fechado,
  })).toBe('Seg–Sex 9h–22h · Sáb 10h–18h · Dom fechado');
});

test('minutos e dias sem horário', () => {
  expect(summarizeHours({ monday: h('09:30', '18:00') })).toBe('Seg 9h30–18h · Ter–Dom sem horário');
  expect(summarizeHours(null)).toBe('Sem horário definido');
  expect(summarizeHours({})).toBe('Sem horário definido');
});

test('virada de meia-noite mostra dica', () => {
  expect(summarizeHours({
    monday: h('18:00', '02:00'), tuesday: h('18:00', '02:00'), wednesday: h('18:00', '02:00'),
    thursday: h('18:00', '02:00'), friday: h('18:00', '02:00'), saturday: h('20:00', '04:00'), sunday: h('09:00', '22:00'),
  })).toBe('Seg–Sex 18h–2h (fecha no dia seguinte) · Sáb 20h–4h (fecha no dia seguinte) · Dom 9h–22h');
});

test('dayError', () => {
  expect(dayError(h('09:00', '22:00'))).toBeNull();
  expect(dayError(h('18:00', '02:00'))).toBeNull(); // virada de meia-noite é válida
  expect(dayError(h('10:00', '10:00'))).toBe('O fechamento precisa ser diferente da abertura.');
  expect(dayError(h('', '09:00'))).toBe('Informe abertura e fechamento.');
  expect(dayError({ open: '', close: '', closed: true })).toBeNull();
});

test('copyToWeekdays copia a segunda para terça a sexta e mantém o fim de semana', () => {
  const base: any = {};
  for (const d of WEEK) base[d.key] = fechado;
  base.monday = h('08:00', '20:00');
  const out = copyToWeekdays(base);
  for (const d of ['tuesday', 'wednesday', 'thursday', 'friday']) expect(out[d as 'tuesday']).toEqual(h('08:00', '20:00'));
  expect(out.saturday).toEqual(fechado);
  expect(out.sunday).toEqual(fechado);
  expect(out.tuesday).not.toBe(out.monday);
});
