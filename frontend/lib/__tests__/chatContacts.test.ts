import { participantTypeFor } from '../chatContacts';

describe('participantTypeFor', () => {
  it('loja (kind store) → store', () => {
    expect(participantTypeFor({ role: 'lojista', kind: 'store' })).toBe('store');
  });
  it('motoboy → motoboy', () => {
    expect(participantTypeFor({ role: 'motoboy', kind: 'user' })).toBe('motoboy');
  });
  it('cliente → customer', () => {
    expect(participantTypeFor({ role: 'cliente', kind: 'user' })).toBe('customer');
  });
});
