import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OrderPushPrompt, PUSH_PROMPT_DISMISS_KEY } from '../OrderPushPrompt';

const mockShowToast = jest.fn();
jest.mock('../../../ui/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }));

let mockPush: any;
jest.mock('../../../../hooks/usePushNotifications', () => ({ ...jest.requireActual('../../../../hooks/usePushNotifications'), usePushNotifications: () => mockPush }));

beforeEach(() => {
  localStorage.clear();
  mockShowToast.mockClear();
  mockPush = { supported: true, permission: 'default', subscribed: false, busy: false, error: null, blockedText: 'Avisos bloqueados neste navegador. Libere as notificações nas configurações do site.', enable: jest.fn(async () => true), disable: jest.fn(), sendTest: jest.fn() };
});

describe('OrderPushPrompt — pedir o push na tela do pedido', () => {
  it('pedido em andamento, sem push: convida a ativar', () => {
    render(<OrderPushPrompt />);
    expect(screen.getByText('Ative os avisos do pedido')).toBeInTheDocument();
    expect(screen.getByText(/sair para entrega/i)).toBeInTheDocument();
  });

  it('ativar: pede a permissão e confirma (sem o push de teste das corridas)', async () => {
    render(<OrderPushPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Ativar avisos' }));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Avisos ativados', 'success'));
    expect(mockPush.enable).toHaveBeenCalledTimes(1);
    expect(mockPush.sendTest).not.toHaveBeenCalled();
  });

  it('permissão negada ao ativar: explica como liberar', async () => {
    // O navegador nega no pedido de permissão (o estado do hook só muda no próximo render).
    mockPush.enable = jest.fn(async () => { (window as any).Notification = { permission: 'denied' }; return false; });
    render(<OrderPushPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Ativar avisos' }));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/bloqueados/), 'error'));
    delete (window as any).Notification;
  });

  it('"Agora não" esconde e lembra no aparelho', () => {
    const { rerender } = render(<OrderPushPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(screen.queryByText('Ative os avisos do pedido')).not.toBeInTheDocument();
    expect(localStorage.getItem(PUSH_PROMPT_DISMISS_KEY)).toBe('1');
    rerender(<OrderPushPrompt />);
    expect(screen.queryByText('Ative os avisos do pedido')).not.toBeInTheDocument();
  });

  it.each([
    ['já inscrito', { subscribed: true }],
    ['navegador sem suporte', { supported: false, permission: 'unsupported' }],
    ['permissão já negada', { permission: 'denied' }],
  ])('%s: não aparece', (_n, over) => {
    mockPush = { ...mockPush, ...over };
    render(<OrderPushPrompt />);
    expect(screen.queryByText('Ative os avisos do pedido')).not.toBeInTheDocument();
  });

  it('dispensado antes: não aparece', () => {
    localStorage.setItem(PUSH_PROMPT_DISMISS_KEY, '1');
    render(<OrderPushPrompt />);
    expect(screen.queryByText('Ative os avisos do pedido')).not.toBeInTheDocument();
  });
});
