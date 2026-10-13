import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../../ui/Toast';
import { PauseSheet, isPaused, pausedUntilLabel, resumeStore } from '../PauseSheet';
import api from '../../../../lib/api';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { put: jest.fn(), delete: jest.fn() } }));

function renderSheet(activeOrders = 2) {
  const onChanged = jest.fn();
  const onClose = jest.fn();
  render(
    <ToastProvider>
      <PauseSheet open storeId="s1" onClose={onClose} onChanged={onChanged} activeOrders={activeOrders} />
    </ToastProvider>,
  );
  return { onChanged, onClose };
}

beforeEach(() => jest.clearAllMocks());

test.each([
  ['30 minutos', { minutes: 30 }],
  ['1 hora', { minutes: 60 }],
  ['2 horas', { minutes: 120 }],
  ['Até amanhã', { untilTomorrow: true }],
])('"%s" envia o corpo do contrato e devolve a hora de volta', async (label, body) => {
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true, data: { pausedUntil: '2026-10-12T18:30:00.000Z' } } });
  const { onChanged, onClose } = renderSheet();
  fireEvent.click(screen.getByText(label as string));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/stores/s1/pause', body));
  await waitFor(() => expect(onChanged).toHaveBeenCalledWith('2026-10-12T18:30:00.000Z'));
  expect(onClose).toHaveBeenCalled();
});

test('avisa que os pedidos aceitos continuam', () => {
  renderSheet(2);
  expect(screen.getByText('Os 2 pedidos aceitos continuam.')).toBeInTheDocument();
});

test('erro do servidor: não fecha e mostra a mensagem', async () => {
  (api.put as jest.Mock).mockRejectedValue({ response: { status: 403, data: { error: 'Sem permissão' } } });
  const { onChanged, onClose } = renderSheet();
  fireEvent.click(screen.getByText('1 hora'));
  expect(await screen.findByText('Sem permissão')).toBeInTheDocument();
  expect(onChanged).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

test('envio único: dois cliques seguidos mandam uma só requisição', async () => {
  let resolve: (v: any) => void = () => {};
  (api.put as jest.Mock).mockReturnValue(new Promise((r) => { resolve = r; }));
  const { onChanged } = renderSheet();
  fireEvent.click(screen.getByText('1 hora'));
  fireEvent.click(screen.getByText('1 hora'));
  fireEvent.click(screen.getByText('2 horas'));
  expect(api.put).toHaveBeenCalledTimes(1);
  resolve({ data: { success: true, data: { pausedUntil: '2026-10-12T18:30:00.000Z' } } });
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
});

test('resumeStore chama o DELETE do contrato', async () => {
  (api.delete as jest.Mock).mockResolvedValue({ data: { success: true, data: { pausedUntil: null } } });
  await resumeStore('s1');
  expect(api.delete).toHaveBeenCalledWith('/stores/s1/pause');
});

test('isPaused e rótulo da hora de volta (fuso de São Paulo)', () => {
  const now = new Date('2026-10-12T18:00:00Z'); // 15:00 em SP
  expect(isPaused(null, now)).toBe(false);
  expect(isPaused('2026-10-12T17:00:00Z', now)).toBe(false);
  expect(isPaused('2026-10-12T19:00:00Z', now)).toBe(true);
  expect(isPaused('lixo', now)).toBe(false);
  expect(pausedUntilLabel('2026-10-12T19:05:00Z', now)).toBe('Pausada até 16:05');
  expect(pausedUntilLabel('2026-10-13T11:00:00Z', now)).toBe('Pausada até 13/10, 08:00');
  // 23:30 em SP ainda é "hoje" mesmo já sendo dia 13 em UTC
  expect(pausedUntilLabel('2026-10-13T02:30:00Z', now)).toBe('Pausada até 23:30');
});
