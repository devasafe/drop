/** App Android (Capacitor): push pelo FCM, voltar do aparelho e toque na notificação. No navegador, nada muda. */
import { act, render, renderHook, waitFor } from '@testing-library/react';
import api from '../lib/api';

const listeners: Record<string, (arg: any) => void> = {};
const addListener = jest.fn((event: string, cb: (arg: any) => void) => {
  listeners[event] = cb;
  return Promise.resolve({ remove: jest.fn(async () => undefined) });
});
const push = {
  checkPermissions: jest.fn(async () => ({ receive: 'prompt' })),
  requestPermissions: jest.fn(async () => ({ receive: 'granted' })),
  createChannel: jest.fn(async () => undefined),
  register: jest.fn(async () => { setTimeout(() => listeners.registration?.({ value: 'tok-123' }), 0); }),
  unregister: jest.fn(async () => undefined),
  addListener,
};
const app = { addListener, minimizeApp: jest.fn(async () => undefined) };
jest.mock('@capacitor/push-notifications', () => ({ PushNotifications: push }));
jest.mock('@capacitor/app', () => ({ App: app }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(async () => ({ data: {} })) } }));
const mockPush = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush }) }));
let mockUser: any = null;
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));

import { usePushNotifications } from '../hooks/usePushNotifications';
import { NativeBridge } from '../components/NativeBridge';

const post = api.post as jest.Mock;
const setNative = (on: boolean) => {
  (window as any).Capacitor = on ? { isNativePlatform: () => true } : undefined;
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(listeners).forEach((k) => delete listeners[k]);
  localStorage.clear();
  mockUser = null;
  setNative(true);
});
afterAll(() => setNative(false));

test('no app, ativar o push pede a permissão, cria os canais e envia o token do FCM', async () => {
  const { result } = renderHook(() => usePushNotifications());
  await waitFor(() => expect(result.current.permission).toBe('default'));
  expect(result.current.supported).toBe(true);

  let ok = false;
  await act(async () => { ok = await result.current.enable(); });
  expect(ok).toBe(true);
  expect(push.requestPermissions).toHaveBeenCalled();
  expect(push.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 'corridas', importance: 5 }));
  expect(post).toHaveBeenCalledWith('/push/subscribe', { platform: 'fcm', token: 'tok-123' });
  expect(result.current.subscribed).toBe(true);

  await act(async () => { await result.current.disable(); });
  expect(post).toHaveBeenCalledWith('/push/unsubscribe', { endpoint: 'fcm:tok-123' });
  expect(result.current.subscribed).toBe(false);
});

test('no app, permissão negada não registra nem envia nada', async () => {
  push.requestPermissions.mockResolvedValueOnce({ receive: 'denied' });
  const { result } = renderHook(() => usePushNotifications());
  await act(async () => { await result.current.enable(); });
  expect(result.current.permission).toBe('denied');
  expect(push.register).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
});

test('voltar do Android: volta no histórico ou minimiza na primeira tela', async () => {
  const back = jest.spyOn(window.history, 'back').mockImplementation(() => undefined);
  render(<NativeBridge />);
  await waitFor(() => expect(listeners.backButton).toBeDefined());
  listeners.backButton({ canGoBack: true });
  expect(back).toHaveBeenCalled();
  listeners.backButton({ canGoBack: false });
  expect(app.minimizeApp).toHaveBeenCalled();
  back.mockRestore();
});

test('tocar na notificação abre a tela do aviso (só caminho interno)', async () => {
  render(<NativeBridge />);
  await waitFor(() => expect(listeners.pushNotificationActionPerformed).toBeDefined());
  listeners.pushNotificationActionPerformed({ notification: { data: { url: '/pedido/abc' } } });
  expect(mockPush).toHaveBeenCalledWith('/pedido/abc');
  listeners.pushNotificationActionPerformed({ notification: { data: { url: 'https://evil.example' } } });
  listeners.pushNotificationActionPerformed({ notification: { data: { url: '//evil.example' } } });
  expect(mockPush).toHaveBeenCalledTimes(1);
});

test('logado com o push já autorizado, o token vai para a conta atual', async () => {
  push.checkPermissions.mockResolvedValue({ receive: 'granted' });
  mockUser = { id: 'u1' };
  render(<NativeBridge />);
  await waitFor(() => expect(post).toHaveBeenCalledWith('/push/subscribe', { platform: 'fcm', token: 'tok-123' }));
  push.checkPermissions.mockResolvedValue({ receive: 'prompt' });
});

test('logout no app tira a inscrição do aparelho antes de sair', async () => {
  const { nativePushForget } = require('../lib/nativePush');
  localStorage.setItem('drop.fcmToken', 'tok-velho');
  nativePushForget();
  expect(post).toHaveBeenCalledWith('/push/unsubscribe', { endpoint: 'fcm:tok-velho' });
  expect(localStorage.getItem('drop.fcmToken')).toBeNull();
});

test('no navegador, o NativeBridge não liga nada', async () => {
  setNative(false);
  mockUser = { id: 'u1' };
  render(<NativeBridge />);
  await new Promise((r) => setTimeout(r, 10));
  expect(addListener).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
});
