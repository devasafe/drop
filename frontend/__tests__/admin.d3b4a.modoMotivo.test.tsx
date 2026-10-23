import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SaasFeeCard } from '../components/admin/regras/SaasFeeCard';
import { SettlementModeCard } from '../components/admin/regras/SettlementModeCard';
import api from '../lib/api';

jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
}));

const preview = { from: 'direto', to: 'custodia', confirmPhrase: 'TROCAR PARA APP', blockers: [], risks: ['risco'], counts: {} };

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockResolvedValue({ data: preview });
  (api.put as jest.Mock).mockResolvedValue({ data: { settlementMode: 'custodia' } });
});

describe('SaasFeeCard: motivo', () => {
  const initial = { saasMonthlyFee: 49.9, saasTrialDays: 14, saasGraceDays: 5, directTransfersEnabled: false };

  it('manda changeReason quando o motivo é preenchido', async () => {
    render(<SaasFeeCard initial={initial} onSaved={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Motivo (opcional)'), { target: { value: 'reajuste' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar mensalidade' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/switches', expect.objectContaining({ changeReason: 'reajuste' })));
  });

  it('motivo vazio não manda changeReason', async () => {
    render(<SaasFeeCard initial={initial} onSaved={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar mensalidade' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect((api.put as jest.Mock).mock.calls[0][1]).not.toHaveProperty('changeReason');
  });
});

describe('SettlementModeCard: motivo', () => {
  it('o motivo do sheet vai junto com a frase de confirmação', async () => {
    render(<SettlementModeCard mode="direto" onChanged={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Trocar para o modo app/ }));
    fireEvent.change(await screen.findByLabelText(/Digite TROCAR PARA APP/), { target: { value: 'TROCAR PARA APP' } });
    fireEvent.change(screen.getByLabelText('Motivo (opcional)'), { target: { value: 'migração' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar troca' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/switches', {
      settlementMode: 'custodia', confirmSettlement: 'TROCAR PARA APP', changeReason: 'migração',
    }));
  });
});
