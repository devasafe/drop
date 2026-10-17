/**
 * D3a · P4.1 — Dinheiro · Carteiras (tela 17).
 * Caracterização: as chamadas que a página antiga faz (passa na antiga e na nova).
 * Tela nova: leitura que falha mostra erro (nunca zero ou lista vazia), "Ajustar saldo" (D3b-3) está em
 * admin.d3b3.ajusteSaldo.test.tsx; aqui, pedido de acesso na AdminSheet, celular em cartões.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import api from '../lib/api';
import AdminWalletsPage from '../pages/admin/wallets';
import { resetViewport, setViewportWidth } from './helpers/viewport';

const mockToast = jest.fn();
let mockRole = 'ceo';
let mockCan: (p: string) => boolean = () => true;
// objeto `user` estável (F6): um `user` novo a cada render prenderia os efeitos `[user]` num laço
const mockUsers: Record<string, { id: string; name: string; email: string; role: string; activeRole: string }> = {
  ceo: { id: 'adm1', name: 'Marina', email: 'm@x.com', role: 'ceo', activeRole: 'ceo' },
  gerente_geral: { id: 'adm1', name: 'Marina', email: 'm@x.com', role: 'gerente_geral', activeRole: 'gerente_geral' },
};

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/wallets', asPath: '/admin/wallets' }),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUsers[mockRole],
    can: (p: string) => mockCan(p),
    loading: false,
    permissionsLoading: false,
  }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

const WALLETS = [
  {
    _id: 'w1', owner: 'u1', userId: 'u1', balance: 118.32, totalSpent: 20, totalWithdrawn: 86.4,
    userName: 'Carlos Lima', userEmail: 'carlos@x.com', userRole: 'motoboy', hasAccess: true,
  },
  {
    _id: 'w2', owner: 'u2', userId: 'u2', balance: null, totalSpent: null,
    userName: 'Ana Souza', userEmail: 'ana@x.com', userRole: 'cliente', hasAccess: false,
  },
];
const TXS = [
  {
    _id: 't1', type: 'credit', category: 'deposit', amount: 9.92, reason: 'Repasse #4790',
    paymentMethod: 'pix', status: 'completed', createdAt: '2026-10-08T13:05:00Z',
  },
];

type Override = Record<string, () => Promise<unknown>>;
function mockServer(over: Override = {}) {
  get.mockImplementation((url: string) => {
    if (over[url]) return over[url]();
    if (url === '/wallet-access/outgoing') return Promise.resolve({ data: { requests: [] } });
    if (url === '/admin/wallets') return Promise.resolve({ data: WALLETS });
    if (url === '/admin/wallets/w1/transactions') return Promise.resolve({ data: TXS });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
  post.mockResolvedValue({ data: { success: true, newBalance: 143.82 } });
}

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'ceo';
  mockCan = () => true;
  // a página antiga chama alert() depois das ações; a nova não pode (guarda da P1.8)
  alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => undefined);
  mockServer();
});
afterEach(() => {
  alertSpy.mockRestore();
  resetViewport();
});

const openCarlos = async () => {
  await screen.findByText('Carlos Lima');
  fireEvent.click(screen.getByRole('button', { name: /^(Ver|Ver extrato)$/ }));
  await waitFor(() => expect(get).toHaveBeenCalledWith('/admin/wallets/w1/transactions'));
};

describe('caracterização: chamadas ao servidor (página antiga e nova)', () => {
  it('abre lendo as carteiras e os pedidos de acesso', async () => {
    render(<AdminWalletsPage />);
    expect(await screen.findByText('Carlos Lima')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/admin/wallets');
    expect(get).toHaveBeenCalledWith('/wallet-access/outgoing');
  });

  it('com acesso: abre o extrato da carteira', async () => {
    render(<AdminWalletsPage />);
    await openCarlos();
  });

  it('sem acesso: pede acesso com a justificativa (POST /wallet-access/request)', async () => {
    render(<AdminWalletsPage />);
    await screen.findByText('Ana Souza');
    fireEvent.click(screen.getByRole('button', { name: /^(Solicitar acesso|Pedir acesso)$/ }));
    fireEvent.change(screen.getByPlaceholderText(/investigando reclamação #123/), {
      target: { value: '  Reclamação 123 de débito  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^(Enviar solicitação|Enviar pedido)$/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/wallet-access/request', {
      targetUserId: 'u2', reason: 'Reclamação 123 de débito',
    }));
  });
});

describe('tela nova', () => {
  it('leitura das carteiras falha: erro com "Tentar de novo", sem lista e sem zero', async () => {
    let fail = true;
    mockServer({
      '/admin/wallets': () => (fail ? Promise.reject(new Error('500')) : Promise.resolve({ data: WALLETS })),
    });
    render(<AdminWalletsPage />);
    expect(await screen.findByText('Não deu para carregar as carteiras.')).toBeInTheDocument();
    expect(screen.queryByText(/R\$ 0,00/)).not.toBeInTheDocument();
    expect(screen.queryByText('Carlos Lima')).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Carlos Lima')).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('pedidos de acesso que não carregam: aviso com "Tentar de novo"', async () => {
    mockServer({ '/wallet-access/outgoing': () => Promise.reject(new Error('500')) });
    render(<AdminWalletsPage />);
    expect(await screen.findByText(/^Não deu para ler os seus pedidos de acesso\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(get.mock.calls.filter(([u]) => u === '/wallet-access/outgoing')).toHaveLength(2));
  });

  it('extrato carregado: movimento, origem e valor com sinal', async () => {
    render(<AdminWalletsPage />);
    await openCarlos();
    expect(await screen.findByText('Depósito via Pix')).toBeInTheDocument();
    expect(screen.getByText('Repasse #4790')).toBeInTheDocument();
    expect(screen.getByText('+R$ 9,92')).toBeInTheDocument();
  });

  it('duas aberturas rápidas com respostas fora de ordem: o extrato fica o da carteira aberta por último', async () => {
    const BIA = { ...WALLETS[0], _id: 'w3', owner: 'u3', userId: 'u3', userName: 'Bia Rocha', userEmail: 'bia@x.com' };
    const pend: Record<string, (v: unknown) => void> = {};
    const later = (key: string) => () => new Promise((r) => { pend[key] = r; });
    mockServer({
      '/admin/wallets': () => Promise.resolve({ data: [WALLETS[0], BIA] }),
      '/admin/wallets/w1/transactions': later('w1'),
      '/admin/wallets/w3/transactions': later('w3'),
    });
    render(<AdminWalletsPage />);
    await screen.findByText('Bia Rocha');
    const [verCarlos, verBia] = screen.getAllByRole('button', { name: /^(Ver|Ver extrato)$/ });
    fireEvent.click(verCarlos);
    fireEvent.click(verBia);
    await waitFor(() => expect(pend.w1 && pend.w3).toBeTruthy());
    await act(async () => {
      pend.w3({ data: [{ ...TXS[0], _id: 't3', reason: 'Extrato da Bia' }] });
    });
    await act(async () => {
      pend.w1({ data: [{ ...TXS[0], _id: 't1', reason: 'Extrato do Carlos' }] });
    });
    const carteira = screen.getByRole('region', { name: 'Carteira de Bia Rocha' });
    expect(within(carteira).getByText('Extrato da Bia')).toBeInTheDocument();
    expect(screen.queryByText('Extrato do Carlos')).toBeNull();
  });

  it('extrato com 403: "Acesso expirado", relê os pedidos e não mostra extrato vazio', async () => {
    mockServer({
      '/admin/wallets/w1/transactions': () => Promise.reject({ response: { status: 403, data: { error: 'ACCESS_NOT_GRANTED' } } }),
    });
    render(<AdminWalletsPage />);
    await openCarlos();
    expect(await screen.findByText('Acesso expirado. Peça acesso de novo.')).toBeInTheDocument();
    await waitFor(() => expect(get.mock.calls.filter(([u]) => u === '/wallet-access/outgoing')).toHaveLength(2));
    expect(screen.queryByText('Nenhuma movimentação ainda')).not.toBeInTheDocument();
  });

  it('extrato com erro do servidor: erro com "Tentar de novo"', async () => {
    mockServer({ '/admin/wallets/w1/transactions': () => Promise.reject(new Error('500')) });
    render(<AdminWalletsPage />);
    await openCarlos();
    expect(await screen.findByText('Não deu para carregar o extrato.')).toBeInTheDocument();
  });

  it('sem acesso: saldo e gastos escondidos', async () => {
    render(<AdminWalletsPage />);
    const row = (await screen.findByText('Ana Souza')).closest('tr')!;
    expect(within(row).getByLabelText('Saldo oculto')).toBeInTheDocument();
    expect(within(row).getByLabelText('Gastos ocultos')).toBeInTheDocument();
  });

  it('situação do pedido de acesso em cada linha', async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const at = '2026-10-08T10:00:00Z';
    mockServer({
      '/admin/wallets': () => Promise.resolve({
        data: [...WALLETS, {
          _id: 'w3', owner: 's3', userId: 'u3', balance: null, userName: 'Eletro Center',
          userEmail: 'eletro@x.com', userRole: 'lojista', hasAccess: false,
        }],
      }),
      '/wallet-access/outgoing': () => Promise.resolve({
        data: {
          requests: [
            { _id: 'r1', targetUserId: 'u1', status: 'approved', reason: 'x', expiresAt: future, createdAt: at },
            { _id: 'r2', targetUserId: { _id: 'u2' }, status: 'pending', reason: 'y', expiresAt: null, createdAt: at },
            { _id: 'r3', targetUserId: 'u3', status: 'rejected', reason: 'z', expiresAt: null, createdAt: at },
          ],
        },
      }),
    });
    render(<AdminWalletsPage />);
    await screen.findByText('Eletro Center');
    expect(screen.getByRole('button', { name: /^Ver extrato · até \d{2}:\d{2}$/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Aguardando resposta' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Recusado · pedir de novo' })).toBeEnabled();
  });

  it('erro do servidor ao pedir acesso aparece dentro da AdminSheet, que fica aberta', async () => {
    post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Já existe um pedido pendente' } } });
    render(<AdminWalletsPage />);
    await screen.findByText('Ana Souza');
    fireEvent.click(screen.getByRole('button', { name: 'Pedir acesso' }));
    const sheet = screen.getByRole('dialog', { name: 'Pedir acesso à carteira' });
    const send = within(sheet).getByRole('button', { name: 'Enviar pedido' });
    fireEvent.change(within(sheet).getByLabelText('Justificativa (mínimo 5 caracteres)'), { target: { value: 'abc' } });
    expect(send).toBeDisabled();
    fireEvent.change(within(sheet).getByLabelText('Justificativa (mínimo 5 caracteres)'), { target: { value: 'Reclamação 123' } });
    fireEvent.click(send);
    expect(await within(sheet).findByText('Já existe um pedido pendente')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('busca por nome ou e-mail e filtro por papel', async () => {
    render(<AdminWalletsPage />);
    await screen.findByText('Carlos Lima');
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'ana@' } });
    expect(screen.queryByText('Carlos Lima')).not.toBeInTheDocument();
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Papel'), { target: { value: 'motoboy' } });
    expect(screen.getByText('Carlos Lima')).toBeInTheDocument();
    expect(screen.queryByText('Ana Souza')).not.toBeInTheDocument();
  });

  it('celular: carteiras em cartões, com a ação no cartão', async () => {
    setViewportWidth(360);
    render(<AdminWalletsPage />);
    await screen.findByText('Carlos Lima');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const card = screen.getByText('Carlos Lima').closest('li')!;
    expect(within(card).getByRole('button', { name: 'Ver extrato' })).toBeInTheDocument();
  });
});
