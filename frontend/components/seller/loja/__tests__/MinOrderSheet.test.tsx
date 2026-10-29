import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../../ui/Toast';
import { MinOrderSheet } from '../MinOrderSheet';
import api from '../../../../lib/api';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { put: jest.fn() } }));

const renderSheet = (over: any = {}) => {
  const props = { open: true, onClose: jest.fn(), storeId: 's1', current: null, platformMin: 5, onSaved: jest.fn(), ...over };
  render(<ToastProvider><MinOrderSheet {...props} /></ToastProvider>);
  return props;
};

beforeEach(() => jest.clearAllMocks());

test('salva o mínimo da loja em reais', async () => {
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true } });
  const p = renderSheet();
  fireEvent.change(screen.getByLabelText('Pedido mínimo (R$)'), { target: { value: '20,50' } });
  fireEvent.click(screen.getByText('Salvar'));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/stores/s1', { minOrderValue: 20.5 }));
  expect(p.onSaved).toHaveBeenCalled();
  expect(p.onClose).toHaveBeenCalled();
});

test('abaixo do mínimo da DROP: erro e botão desligado', () => {
  renderSheet();
  fireEvent.change(screen.getByLabelText('Pedido mínimo (R$)'), { target: { value: '3' } });
  expect(screen.getByText('Use R$ 5,00 ou mais (mínimo da DROP).')).toBeInTheDocument();
  expect(screen.getByText('Salvar').closest('button')).toBeDisabled();
});

test('vazio volta ao mínimo da DROP (null)', async () => {
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true } });
  renderSheet({ current: 30 });
  expect(screen.getByLabelText('Pedido mínimo (R$)')).toHaveValue('30,00');
  fireEvent.change(screen.getByLabelText('Pedido mínimo (R$)'), { target: { value: '' } });
  fireEvent.click(screen.getByText('Salvar'));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/stores/s1', { minOrderValue: null }));
});
