// frontend/__tests__/seller-conta-asaas.test.tsx
// Estados da página Conta Asaas (porta de AsaasConnectCard.consent 3 e 4 no nível da página).
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../components/ui/Toast';
import SellerContaAsaas from '../pages/seller/conta-asaas';
import api from '../lib/api';

const mockPush = jest.fn();
let mockQuery: any = {};
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: mockQuery, pathname: '/seller/conta-asaas' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/ModeGate', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn() } }));

const checklist = { apiKey: true, paymentWebhook: true, ipWhitelistConfirmed: true, authWebhookConfirmed: true };
const valid = { status: 'valid', environment: 'production', lastCheckedAt: null, apiKeyLast4: '8F2A', checklist, consent: { version: '2026-10-08', acceptedAt: '2026-10-08T12:00:00.000Z' }, termsVersion: '2026-10-08' };
const validNoConsent = { ...valid, consent: null };

function mockGet(statusData: any) {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/stores/dashboard') return Promise.resolve({ data: { store: { _id: 's1' } } });
    if (url === '/settings/saas') return Promise.resolve({ data: { egressIp: '203.0.113.7' } });
    if (url === '/settings/store-asaas-terms') return Promise.resolve({ data: { version: '2026-10-08', text: 'Termo.' } });
    return Promise.resolve({ data: { success: true, data: statusData } });
  });
}

beforeEach(() => { jest.clearAllMocks(); mockQuery = {}; });
const renderPage = () => render(<ToastProvider><SellerContaAsaas /></ToastProvider>);

test('conta válida sem aceite: aviso some depois de aceitar', async () => {
  mockGet(validNoConsent);
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: valid } });
  renderPage();
  expect(await screen.findByText(/Aceite o termo para voltar a vender/)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Li e aceito o termo'));
  fireEvent.click(screen.getByText('Aceitar o termo'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores/s1/asaas/consent', { acceptTerms: true, termsVersion: '2026-10-08' }));
  await waitFor(() => expect(screen.queryByText(/Aceite o termo para voltar a vender/)).not.toBeInTheDocument());
});

test('conta válida com aceite em dia: sem aviso e sem "Aceitar o termo"', async () => {
  mockGet(valid);
  renderPage();
  await screen.findByText('Chave válida');
  expect(screen.queryByText(/Aceite o termo para voltar a vender/)).not.toBeInTheDocument();
  expect(screen.queryByText('Aceitar o termo')).not.toBeInTheDocument();
});

test('"Trocar" abre o termo e a chave com "Trocar chave"; "Cancelar" volta', async () => {
  mockGet(valid);
  renderPage();
  fireEvent.click(await screen.findByText('Trocar'));
  expect(screen.getByText('Trocar chave')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Cancelar'));
  expect(screen.queryByText('Trocar chave')).not.toBeInTheDocument();
});

test('no cadastro, com tudo pronto, volta para Abrir a loja', async () => {
  mockQuery = { onboarding: '1' };
  mockGet(valid);
  renderPage();
  fireEvent.click(await screen.findByText('Voltar para Abrir a loja'));
  expect(mockPush).toHaveBeenCalledWith('/seller/abrir');
});

test('sem loja: avisa e não chama o Asaas', async () => {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/stores/dashboard') return Promise.reject(Object.assign(new Error('404'), { response: { status: 404 } }));
    if (url === '/settings/store-asaas-terms') return Promise.resolve({ data: { version: 'v', text: 't' } });
    return Promise.resolve({ data: {} });
  });
  renderPage();
  expect(await screen.findByText('Crie a loja antes de conectar a conta Asaas.')).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalledWith(expect.stringMatching(/^\/stores\/.*\/asaas$/));
});

// Quem calcula `blocking` é a página (revisão da T107): sem aceite válido bloqueia; versão antiga só avisa.
test('aceite de versão antiga: só avisa (a loja segue vendendo), sem bloquear', async () => {
  mockGet({ ...valid, consent: { version: '2026-01-01', acceptedAt: '2026-01-01T12:00:00.000Z' } });
  renderPage();
  expect(await screen.findByText('O termo foi atualizado')).toBeInTheDocument();
  expect(screen.getByText(/A loja segue vendendo/)).toBeInTheDocument();
  expect(screen.queryByText(/Aceite o termo para voltar a vender/)).not.toBeInTheDocument();
  expect(screen.getByText('Aceitar o termo')).toBeInTheDocument();
});

test('aceite sem versão ou sem data (malformado): fail closed, bloqueia', async () => {
  mockGet({ ...valid, consent: { version: '', acceptedAt: '2026-10-08T12:00:00.000Z' } });
  renderPage();
  expect(await screen.findByText(/Aceite o termo para voltar a vender/)).toBeInTheDocument();
});

test('termo e chave e novo termo nunca aparecem juntos (um aceite por vez)', async () => {
  mockGet(validNoConsent);
  renderPage();
  await screen.findByText(/Aceite o termo para voltar a vender/);
  expect(screen.getAllByLabelText('Li e aceito o termo')).toHaveLength(1);
  fireEvent.click(screen.getByText('Trocar'));
  expect(screen.getByText('Trocar chave')).toBeInTheDocument();
  expect(screen.queryByText('Aceitar o termo')).not.toBeInTheDocument();
  expect(screen.getAllByLabelText('Li e aceito o termo')).toHaveLength(1);
});

test('chave inválida sem aceite: só o termo e a chave (o novo termo não monta junto)', async () => {
  mockGet({ ...validNoConsent, status: 'invalid' });
  renderPage();
  expect(await screen.findByText('Trocar chave')).toBeInTheDocument();
  expect(screen.queryByText('Aceitar o termo')).not.toBeInTheDocument();
  expect(screen.getAllByLabelText('Li e aceito o termo')).toHaveLength(1);
});
