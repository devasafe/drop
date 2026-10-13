// frontend/components/__tests__/OperatingHoursEditor.v2.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../ui/Toast';
import OperatingHoursEditor from '../OperatingHoursEditor';
import api from '../../lib/api';

jest.mock('../../lib/api', () => ({ __esModule: true, default: { put: jest.fn(() => Promise.resolve({ data: { success: true } })) } }));

const day = (open: string, close: string, closed = false) => ({ open, close, closed });
const base = {
  monday: day('09:00', '22:00'), tuesday: day('08:00', '12:00'), wednesday: day('10:00', '11:00'),
  thursday: day('07:00', '09:00'), friday: day('09:00', '18:00'), saturday: day('10:00', '18:00'),
  sunday: day('09:00', '18:00', true),
};
const renderEditor = (onSaved = jest.fn()) =>
  render(<ToastProvider><OperatingHoursEditor storeId="s1" initialHours={base} onSaved={onSaved} /></ToastProvider>);

beforeEach(() => jest.clearAllMocks());

test('copiar a segunda para os dias úteis e salvar manda só operatingHours (sem isOpen)', async () => {
  const onSaved = jest.fn();
  renderEditor(onSaved);
  fireEvent.click(screen.getByText('Copiar segunda para os dias úteis'));
  fireEvent.click(screen.getByText('Salvar horários'));
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
  const [url, body] = (api.put as jest.Mock).mock.calls[0];
  expect(url).toBe('/stores/s1/operating-hours');
  expect(body).not.toHaveProperty('isOpen');
  for (const d of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']) {
    expect(body.operatingHours[d]).toEqual(day('09:00', '22:00'));
  }
  expect(body.operatingHours.saturday).toEqual(day('10:00', '18:00'));
  expect(body.operatingHours.sunday.closed).toBe(true);
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
});

const openDay = (label: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}: editar`) }));

test('cada dia é uma linha com o horário resumido e as horas só aparecem ao tocar', () => {
  renderEditor();
  expect(screen.getByRole('button', { name: 'Segunda: editar horário, 09:00 – 22:00' })).toHaveTextContent('09:00 – 22:00');
  expect(screen.getByText('Fechado')).toBeInTheDocument();
  expect(screen.queryByLabelText('Segunda: abre às')).not.toBeInTheDocument();
  openDay('Segunda');
  expect(screen.getByLabelText('Segunda: abre às')).toBeInTheDocument();
});

test('sem horário salvo mostra o aviso de padrão não salvo; com horários salvos não', () => {
  const { unmount } = render(<ToastProvider><OperatingHoursEditor storeId="s1" initialHours={null} /></ToastProvider>);
  expect(screen.getByText(/ainda não foram salvos/i)).toBeInTheDocument();
  unmount();
  renderEditor();
  expect(screen.queryByText(/ainda não foram salvos/i)).not.toBeInTheDocument();
});

test('depois de salvar o aviso de padrão some', async () => {
  render(<ToastProvider><OperatingHoursEditor storeId="s1" initialHours={null} /></ToastProvider>);
  fireEvent.click(screen.getByText('Salvar horários'));
  await waitFor(() => expect(api.put).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByText(/ainda não foram salvos/i)).not.toBeInTheDocument());
});

test('fechamento igual à abertura: erro na linha e salvar bloqueado', () => {
  renderEditor();
  openDay('Segunda');
  fireEvent.change(screen.getByLabelText('Segunda: fecha às'), { target: { value: '09:00' } });
  expect(screen.getByText('O fechamento precisa ser diferente da abertura.')).toBeInTheDocument();
  expect(screen.getByText('Salvar horários').closest('button')).toBeDisabled();
});

test('horário que vira a meia-noite (18:00 às 02:00) é aceito', () => {
  renderEditor();
  openDay('Segunda');
  fireEvent.change(screen.getByLabelText('Segunda: abre às'), { target: { value: '18:00' } });
  fireEvent.change(screen.getByLabelText('Segunda: fecha às'), { target: { value: '02:00' } });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText('Salvar horários').closest('button')).not.toBeDisabled();
});

test('ligar o domingo mostra os horários do dia', () => {
  renderEditor();
  expect(screen.queryByLabelText('Domingo: abre às')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('switch', { name: 'Domingo' }));
  expect(screen.getByRole('button', { name: /^Domingo: editar horário, 09:00 – 18:00/ })).toBeInTheDocument();
});

test('erro do servidor aparece no aviso', async () => {
  (api.put as jest.Mock).mockRejectedValueOnce({ response: { status: 403, data: { error: 'Sem permissão' } } });
  renderEditor();
  fireEvent.click(screen.getByText('Salvar horários'));
  expect(await screen.findByText('Sem permissão')).toBeInTheDocument();
});
