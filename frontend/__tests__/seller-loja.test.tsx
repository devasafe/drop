// frontend/__tests__/seller-loja.test.tsx
/**
 * Loja (D1): a troca de perfil segue a regra de /conta ("Suas áreas"): o servidor decide e,
 * se recusar, a tela não navega. O conteúdo de plano e assinatura muda com o modo.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ToastProvider } from '../components/ui/Toast';
import SellerLoja from '../pages/seller/loja';
import { ROLE_HOME } from '../lib/navConfig';
import api from '../lib/api';

const mockPush = jest.fn();
const mockSwitchRole = jest.fn();
const mockRefresh = jest.fn();
const mockLogout = jest.fn();
let mockUser: any;
let mockPanel: any;
let mockMode = 'custodia';
let mockSaas: { loading: boolean; error: boolean } = { loading: false, error: false };
const mockRetry = jest.fn();
let mockRatings: any[] = [];
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: {}, pathname: '/seller/loja' }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser, switchRole: mockSwitchRole, logout: mockLogout, loading: false }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
jest.mock('../components/seller/panel/SellerPanelProvider', () => ({ useSellerPanel: () => mockPanel }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: mockMode, directCardEnabled: false, ...mockSaas, retry: mockRetry }) }));
jest.mock('../hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({ supported: false, subscribed: false, permission: 'default', busy: false, enable: jest.fn(), disable: jest.fn(), sendTest: jest.fn() }),
}));
jest.mock('../components/StoreQRCode', () => ({ __esModule: true, default: () => <div>QR da loja</div> }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() } }));

const overview = {
  period: { days: 30, start: '', end: '' },
  current: { revenue: 0, orders: 0, productsSold: 0, avgTicket: 0, cancellationRate: 2.1 },
  previous: { revenue: 0, orders: 0, productsSold: 0, avgTicket: 0, cancellationRate: 0 },
  delta: { revenue: 0, orders: 0, productsSold: 0, avgTicket: 0, cancellationRate: 0 },
  platformCancellationRate: 4.8,
};
const baseStore = { _id: 's1', name: 'Eletro Center', plan: 2, customCommissionRate: null, isOpen: true, operatingHours: null, pausedUntil: null, tagline: 'Som e carga', coverBannerUrl: null, logoUrl: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockMode = 'custodia';
  mockSaas = { loading: false, error: false };
  mockUser = { _id: 'u1', name: 'Ana', email: 'ana@email.com', activeRole: 'lojista', roles: ['lojista', 'cliente'] };
  mockPanel = { store: { ...baseStore }, orders: [], refresh: mockRefresh, newOrderCount: 0 };
  mockRatings = [
    { orderId: 'o1', storeRating: 5, storeComment: 'Chegou rápido', createdAt: new Date().toISOString() },
    { orderId: 'o2', storeRating: 4, storeComment: 'Bom', createdAt: new Date().toISOString() },
    { orderId: 'o3', storeRating: 5, storeComment: null, createdAt: new Date().toISOString() },
  ];
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/stores/s1/ratings') return Promise.resolve({ data: mockRatings });
    if (url === '/analytics/store/overview') return Promise.resolve({ data: overview });
    if (url === '/settings/platform-config') return Promise.resolve({ data: { commissionPlan1: 10, commissionPlan2: 15, commissionPlan3: 5 } });
    return Promise.resolve({ data: {} });
  });
});

// Renderiza e deixa as leituras (avaliações, estatística, config) terminarem dentro do act.
const renderPage = async () => {
  const r = render(<ToastProvider><SellerLoja /></ToastProvider>);
  await act(async () => {});
  return r;
};

test('"Suas áreas" troca para o cliente e abre o app do cliente', async () => {
  mockSwitchRole.mockResolvedValue({});
  await renderPage();
  expect(screen.getByRole('heading', { name: 'Suas áreas' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Lojista/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Cliente/ }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith(ROLE_HOME.cliente));
  expect(mockSwitchRole).toHaveBeenCalledWith('cliente');
});

test('troca recusada pelo servidor: não navega', async () => {
  mockSwitchRole.mockRejectedValue(new Error('403'));
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: /Cliente/ }));
  await waitFor(() => expect(mockSwitchRole).toHaveBeenCalledWith('cliente'));
  expect(mockPush).not.toHaveBeenCalled();
});

test('só lojista: a seção não aparece', async () => {
  mockUser = { ...mockUser, roles: ['lojista'] };
  await renderPage();
  expect(screen.queryByRole('heading', { name: 'Suas áreas' })).not.toBeInTheDocument();
});

test('custódia: plano com a comissão do admin e atalho "Plano e comissão", sem Assinatura', async () => {
  await renderPage();
  expect(await screen.findByText('Comissão de 15% por venda')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Plano e comissão/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Assinatura/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/renova/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Plano e comissão/ }));
  expect(mockPush).toHaveBeenCalledWith('/seller/plano');
});

test('comissão personalizada aparece como condição especial', async () => {
  mockPanel = { ...mockPanel, store: { ...baseStore, customCommissionRate: 8 } };
  await renderPage();
  expect(await screen.findByText('Comissão de 8% por venda · condição especial')).toBeInTheDocument();
});

test('direto: Assinatura e Conta Asaas, sem "Plano e comissão"', async () => {
  mockMode = 'direto';
  await renderPage();
  expect(screen.getByRole('button', { name: /Assinatura/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Conta Asaas/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Plano e comissão/ })).not.toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalledWith('/settings/platform-config');
});

test('reputação: média das notas e cancelamento contra a média do DROP', async () => {
  await renderPage();
  expect(await screen.findByText('★ 4,7')).toBeInTheDocument();
  expect(screen.getByText('3 avaliações')).toBeInTheDocument();
  expect(await screen.findByText('2,1%')).toBeInTheDocument();
  expect(screen.getByText('abaixo da média do DROP')).toBeInTheDocument();
});

test('sem avaliações: texto de espera', async () => {
  mockRatings = [];
  await renderPage();
  expect(await screen.findByText('Suas primeiras avaliações aparecem aqui depois das entregas.')).toBeInTheDocument();
});

test('estatística com erro: só o bloco mostra "Tentar de novo"', async () => {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/analytics/store/overview') return Promise.reject(new Error('rede'));
    if (url === '/stores/s1/ratings') return Promise.resolve({ data: mockRatings });
    return Promise.resolve({ data: { commissionPlan2: 15 } });
  });
  await renderPage();
  expect(await screen.findByText('Tentar de novo')).toBeInTheDocument();
  expect(await screen.findByText('★ 4,7')).toBeInTheDocument();
});

test('pausar abre o sheet; pausada mostra "Reabrir agora"', async () => {
  await renderPage();
  fireEvent.click(screen.getByText('Pausar'));
  expect(screen.getByText('Pausar a loja')).toBeInTheDocument();
});

test('atalhos levam às telas certas', async () => {
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: /Horários/ }));
  fireEvent.click(screen.getByRole('button', { name: /Avaliações/ }));
  fireEvent.click(screen.getByRole('button', { name: /Cupons/ }));
  expect(mockPush).toHaveBeenCalledWith('/seller/horarios');
  expect(mockPush).toHaveBeenCalledWith('/seller/avaliacoes');
  expect(mockPush).toHaveBeenCalledWith('/seller/coupons');
});

test('atalhos do celular: todos os subitens da Loja (custódia)', async () => {
  await renderPage();
  const cases: Array<[RegExp, string]> = [
    [/Desempenho/, '/seller/analytics'],
    [/Notificações/, '/seller/notificacoes'],
    [/Integrações/, '/seller/integrations'],
    [/Cadastro e verificação/, '/seller/abrir'],
  ];
  for (const [name, path] of cases) {
    fireEvent.click(screen.getByRole('button', { name }));
    expect(mockPush).toHaveBeenCalledWith(path);
  }
  expect(screen.queryByRole('button', { name: /Conta Asaas/ })).not.toBeInTheDocument();
});

test('direto: Assinatura e Conta Asaas levam às telas do modo direto; sem bloco de comissão', async () => {
  mockMode = 'direto';
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: /Assinatura/ }));
  fireEvent.click(screen.getByRole('button', { name: /Conta Asaas/ }));
  expect(mockPush).toHaveBeenCalledWith('/seller/assinatura');
  expect(mockPush).toHaveBeenCalledWith('/seller/conta-asaas');
  expect(screen.queryByText(/Comissão de/)).not.toBeInTheDocument();
  // Os outros subitens continuam no modo direto.
  for (const name of [/Desempenho/, /Avaliações/, /Cupons/, /Integrações/, /Horários/, /Notificações/]) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument();
  }
});

test('trocar a capa sobe para /stores/banner?type=cover e recarrega o painel', async () => {
  (api.post as jest.Mock).mockResolvedValue({ data: { url: '/uploads/capa.png' } });
  await renderPage();
  const file = new File(['x'], 'capa.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Escolher a capa da loja'), { target: { files: [file] } });
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores/banner?type=cover', expect.any(FormData)));
  await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  expect(await screen.findByText('Capa atualizada')).toBeInTheDocument();
});

test('capa recusada: mostra a mensagem do servidor', async () => {
  (api.post as jest.Mock).mockRejectedValue({ response: { status: 400, data: { success: false, error: { message: 'Formato não aceito', statusCode: 400 } } } });
  await renderPage();
  const file = new File(['x'], 'capa.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Escolher a capa da loja'), { target: { files: [file] } });
  expect(await screen.findByText('Formato não aceito')).toBeInTheDocument();
  expect(mockRefresh).not.toHaveBeenCalled();
});

test('fora do Premium: sem troca do banner da Home', async () => {
  await renderPage();
  expect(screen.queryByLabelText('Escolher o banner da Home')).not.toBeInTheDocument();
});

test('Premium: banner da Home recusado mostra a mensagem do servidor', async () => {
  mockPanel = { ...mockPanel, store: { ...baseStore, plan: 3 } };
  (api.post as jest.Mock).mockRejectedValue({ response: { status: 403, data: { error: 'Banner da Home é só do plano Premium' } } });
  await renderPage();
  const file = new File(['x'], 'home.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Escolher o banner da Home'), { target: { files: [file] } });
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores/banner?type=featured', expect.any(FormData)));
  expect(await screen.findByText('Banner da Home é só do plano Premium')).toBeInTheDocument();
});

test('QR code da loja abre num sheet', async () => {
  await renderPage();
  expect(screen.queryByText('QR da loja')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /QR code da loja/ }));
  expect(screen.getByText('QR da loja')).toBeInTheDocument();
});

test('Sair chama o logout', async () => {
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
  expect(mockLogout).toHaveBeenCalled();
});

test('pausada: mostra "Reabrir agora" e reabre pela API', async () => {
  const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  mockPanel = { ...mockPanel, store: { ...baseStore, pausedUntil: until } };
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: {} } });
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true, data: {} } });
  (api.delete as jest.Mock).mockResolvedValue({ data: { success: true, data: {} } });
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Reabrir agora' }));
  expect(await screen.findByText('Loja reaberta')).toBeInTheDocument();
  expect(screen.getByText('Pausar')).toBeInTheDocument();
});

// O hook devolve 'custodia' enquanto carrega e quando falha: nada de modo aparece sem o modo confirmado.
const expectNoModeContent = () => {
  for (const name of [/Plano e comissão/, /Assinatura/, /Conta Asaas/]) {
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  }
  expect(screen.queryByText(/Comissão de/)).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /^Plano \d/ })).not.toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalledWith('/settings/platform-config');
};

test('modo carregando: sem atalhos de modo nem platform-config; o resto da tela aparece', async () => {
  mockSaas = { loading: true, error: false };
  await renderPage();
  expectNoModeContent();
  expect(screen.getByRole('status', { name: 'Carregando o plano' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Horários/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Suas áreas' })).toBeInTheDocument();
});

test('modo com erro: mensagem com "Tentar de novo", sem atalhos de modo nem platform-config', async () => {
  mockSaas = { loading: false, error: true };
  await renderPage();
  expectNoModeContent();
  expect(screen.getByText('Não carregamos o seu plano')).toBeInTheDocument();
  const retryBtn = screen.getAllByRole('button', { name: 'Tentar de novo' });
  expect(retryBtn).toHaveLength(1);
  fireEvent.click(retryBtn[0]);
  expect(mockRetry).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: /Cupons/ })).toBeInTheDocument();
});

describe('V6 · Conta e plano (sem a Nav global)', () => {
  const contaGroup = () => screen.getByRole('region', { name: 'Conta e plano' });

  test('Meu perfil e Ajuda ficam no grupo "Conta e plano" e levam às rotas do menu da conta', async () => {
    await renderPage();
    const { getByRole } = require('@testing-library/react').within(contaGroup());
    fireEvent.click(getByRole('button', { name: /Meu perfil/ }));
    fireEvent.click(getByRole('button', { name: /Ajuda/ }));
    expect(mockPush).toHaveBeenCalledWith('/user-profile');
    expect(mockPush).toHaveBeenCalledWith('/suporte');
  });

  test.each([
    ['carregando', { loading: true, error: false }],
    ['com erro', { loading: false, error: true }],
  ])('modo %s: o grupo "Conta e plano" nunca fica vazio', async (_n, saas) => {
    mockSaas = saas;
    await renderPage();
    const { getByRole } = require('@testing-library/react').within(contaGroup());
    expect(getByRole('button', { name: /Meu perfil/ })).toBeInTheDocument();
    expect(getByRole('button', { name: /Ajuda/ })).toBeInTheDocument();
  });

  test('custódia: "Comparar planos" no bloco do Plano leva a /seller/plano', async () => {
    await renderPage();
    const plano = screen.getByRole('region', { name: 'Plano' });
    const { getByRole } = require('@testing-library/react').within(plano);
    fireEvent.click(getByRole('button', { name: 'Comparar planos' }));
    expect(mockPush).toHaveBeenCalledWith('/seller/plano');
  });

  test('direto: sem "Comparar planos"', async () => {
    mockMode = 'direto';
    await renderPage();
    expect(screen.queryByRole('button', { name: 'Comparar planos' })).not.toBeInTheDocument();
  });
});
