import asaasClient from '../services/asaas/client';
import { createCardCharge } from '../services/asaas/payment';

jest.mock('../services/asaas/client', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

const post = (asaasClient as any).post as jest.Mock;

const input = {
  customerId: 'cus_1', value: 100.5, orderId: 'ord_1', remoteIp: '187.1.2.3',
  card: { holderName: 'ASAFE M', number: '5162306219378829', expiryMonth: '05', expiryYear: '2030', ccv: '318' },
  holder: { name: 'Asafe', email: 'a@b.com', cpfCnpj: '24971563792', postalCode: '01310000', addressNumber: '10', phone: '11999999999' },
};

test('monta o payload de cartão e mapeia a resposta', async () => {
  post.mockResolvedValueOnce({ id: 'pay_1', status: 'CONFIRMED', creditCardToken: 'tok_1' });
  const res = await createCardCharge(input);
  expect(res).toEqual({ paymentId: 'pay_1', status: 'CONFIRMED', creditCardToken: 'tok_1' });
  const [path, body] = post.mock.calls[0];
  expect(path).toBe('/payments');
  expect(body.billingType).toBe('CREDIT_CARD');
  expect(body.value).toBe(100.5);
  expect(body.remoteIp).toBe('187.1.2.3');
  expect(body.creditCard.number).toBe('5162306219378829');
  expect(body.creditCardHolderInfo.cpfCnpj).toBe('24971563792');
  expect(body.externalReference).toBe('ord_1');
});

test('propaga erro do Asaas (recusa) sem engolir', async () => {
  post.mockRejectedValueOnce(new Error('invalid card'));
  await expect(createCardCharge(input)).rejects.toThrow('invalid card');
});
