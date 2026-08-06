import { CreateOrderSchema } from '../validation/schemas';

const base = { storeId: 'c'.repeat(24), products: [{ productId: 'c'.repeat(24), quantity: 1 }], deliveryDistanceKm: 0 };
const card = { holderName: 'AA', number: '5162306219378829', expiryMonth: '05', expiryYear: '2030', ccv: '318' };
const cardHolder = { name: 'AA', email: 'a@b.com', cpfCnpj: '24971563792', postalCode: '01310000', addressNumber: '10', phone: '11999999999' };

test('credit_card sem card → rejeita', () => {
  const r = CreateOrderSchema.safeParse({ ...base, paymentMethod: 'credit_card' });
  expect(r.success).toBe(false);
});

test('credit_card com card+cardHolder → aceita', () => {
  const r = CreateOrderSchema.safeParse({ ...base, paymentMethod: 'credit_card', card, cardHolder });
  expect(r.success).toBe(true);
});

test('pix sem card → aceita (inalterado)', () => {
  const r = CreateOrderSchema.safeParse({ ...base, paymentMethod: 'pix' });
  expect(r.success).toBe(true);
});
