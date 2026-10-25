import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import api from '../lib/api';

jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn() } }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
import { TaxasTab } from '../components/admin/regras/TaxasTab';

const cfg = {
  commissionPlan1: 5, commissionPlan2: 10, commissionPlan3: 15, motoboyCutPerDelivery: 5, motoboyCutPerKm: 1, motoboyCommissionPercent: 10,
  motoboyMinimumWithdraw: 20, storeMinimumWithdraw: 50, cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10, cancelFeeMotoboyPercent: 10,
  storeAcceptTimeoutMin: 10, poolTimeoutMin: 15, customerAbsentWaitMin: 15, lateCancellationFeePercent: 10, lateCancellationMotoboyShare: 50,
  cardFeePercent: 4, cardFeeFixed: 0.49, cardAnticipationMonthlyRate: 2, cardInstallmentMaxCount: 12, cardInstallmentMinValue: 10,
  returnFullRefundDays: 7, returnStoreResponseHours: 48, settlementMode: 'direto', updatedAt: '2026-10-25T10:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockResolvedValue({ data: cfg });
  (api.put as jest.Mock).mockResolvedValue({ data: { ...cfg, returnFullRefundDays: 10 } });
});

/** Caso B, fase 2: os prazos do reembolso de pedido entregue em Regras e taxas. */
test('seção do reembolso com os dois prazos; salvar manda o campo alterado', async () => {
  render(<TaxasTab />);
  const sec = await screen.findByRole('region', { name: 'Reembolso de pedido entregue' });
  const dias = within(sec).getByLabelText('Arrependimento com valor integral (dias)');
  expect(dias).toHaveValue(7);
  expect(within(sec).getByLabelText('Resposta da loja antes do admin (horas)')).toHaveValue(48);
  fireEvent.change(dias, { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
  await waitFor(() => expect(api.put).toHaveBeenCalled());
  expect((api.put as jest.Mock).mock.calls[0][1]).toMatchObject({ returnFullRefundDays: 10 });
});
