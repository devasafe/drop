/**
 * D3a · casca do admin (spec 3.1, 3.5): menu por papel e por modo, item ativo, contador de verificações,
 * rodapé com nome e papel, data e hora, gaveta no celular que nunca fica presa, erro de render contido.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';

let mockPath = '/admin/payouts';
let mockAsPath = '/admin/payouts';
jest.mock('next/router', () => ({
  useRouter: () => ({ pathname: mockPath, asPath: mockAsPath, query: {}, push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, onClick, ...rest }: { href: string; children?: ReactNode; onClick?: (e: unknown) => void }) => (
    <a href={href} onClick={(e) => { e.preventDefault(); onClick?.(e); }} {...rest}>{children}</a>
  ),
}));

let mockUser: { _id: string; id: string; name: string; role: string; activeRole: string } | null = null;
let mockPerms: string[] = [];
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    can: (p: string) => (mockUser?.activeRole === 'ceo') || mockPerms.includes('*') || mockPerms.includes(p),
  }),
}));
let mockSaas = { settlementMode: 'custodia', directCardEnabled: false, loading: false, error: false, retry: jest.fn() };
jest.mock('../../../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas }));
let mockCustodyOpen = false;
jest.mock('../../../hooks/useAdminCustodyOpen', () => ({ useAdminCustodyOpen: () => mockCustodyOpen }));
let mockBadges = { verifications: 0, storeOrders: 0, deliveries: 0 };
jest.mock('../../../hooks/useSync', () => ({ useBadgeCounts: () => mockBadges }));
jest.mock('../../nav/AccountMenuButton', () => ({ __esModule: true, default: () => <button type="button">Conta</button> }));
// O ScreenErrorBoundary loga pelo logger (console.error preso no import; o spyOn do caso de erro não o pega).
jest.mock('../../../lib/logger', () => ({ __esModule: true, default: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() } }));

// eslint-disable-next-line import/first
import AdminShell, { formatAdminNow } from '../AdminShell';

const CEO = { _id: 'u1', id: 'u1', name: 'Marina Rocha', role: 'ceo', activeRole: 'ceo' };
const GERENTE_MOTOBOYS = { _id: 'u2', id: 'u2', name: 'Ana Souza', role: 'gerente_motoboys', activeRole: 'gerente_motoboys' };

const menu = () => screen.getByRole('navigation', { name: 'Áreas do admin' });
const links = () => within(menu()).getAllByRole('link');
const renderShell = (children: ReactNode = <p>conteúdo</p>) =>
  render(<AdminShell title="Dinheiro · Repasses">{children}</AdminShell>);

beforeEach(() => {
  mockPath = '/admin/payouts';
  mockAsPath = '/admin/payouts';
  mockUser = CEO;
  mockPerms = [];
  mockSaas = { settlementMode: 'custodia', directCardEnabled: false, loading: false, error: false, retry: jest.fn() };
  mockCustodyOpen = false;
  mockBadges = { verifications: 0, storeOrders: 0, deliveries: 0 };
});

describe('AdminShell · menu', () => {
  it('CEO na custódia: grupos e itens na ordem do protótipo; o item da página está ativo', () => {
    renderShell();
    expect(Array.from(menu().querySelectorAll('p')).map((p) => p.textContent)).toEqual([
      'Operação', 'Pessoas', 'Dinheiro', 'Comunicação', 'Configuração',
    ]);
    expect(links().map((a) => a.textContent)).toEqual([
      'Precisa de mim', 'Pedidos ao vivo', 'Mapa ao vivo',
      'Números do negócio', 'Verificações', 'Usuários', 'Lojas', 'Dinheiro', 'Suporte',
      'Avisos e broadcasts', 'Regras e taxas', 'Freios', 'Permissões', 'Tema sazonal',
    ]);
    const dinheiro = within(menu()).getByRole('link', { name: 'Dinheiro' });
    expect(dinheiro).toHaveAttribute('aria-current', 'page');
    expect(dinheiro).toHaveAttribute('href', '/admin/dinheiro');
    expect(within(menu()).getByRole('link', { name: 'Usuários' })).not.toHaveAttribute('aria-current');
  });

  it('cabeçalho com o título e o corpo dentro da casca', () => {
    renderShell();
    expect(screen.getByRole('heading', { level: 1, name: 'Dinheiro · Repasses' })).toBeInTheDocument();
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conta' })).toBeInTheDocument();
  });

  it('CEO no direto: Dinheiro abre a Visão geral e Lojas abre a lista de lojas (D3b-2a)', () => {
    mockSaas = { ...mockSaas, settlementMode: 'direto' };
    renderShell();
    expect(within(menu()).getByRole('link', { name: 'Dinheiro' })).toHaveAttribute('href', '/admin/dinheiro');
    expect(within(menu()).getByRole('link', { name: 'Lojas' })).toHaveAttribute('href', '/admin/lojas');
  });

  it('modo carregando: Lojas só com a lista (sem modo) e Dinheiro só abre a Visão geral (nunca presume custódia)', () => {
    mockSaas = { ...mockSaas, loading: true };
    renderShell();
    expect(within(menu()).getByRole('link', { name: 'Dinheiro' })).toHaveAttribute('href', '/admin/dinheiro');
    expect(within(menu()).getByRole('link', { name: 'Lojas' })).toHaveAttribute('href', '/admin/lojas');
    expect(within(menu()).queryByRole('alert')).toBeNull();
  });

  it('erro ao ler o modo: avisa, Dinheiro só abre a Visão geral e deixa tentar de novo', () => {
    mockSaas = { ...mockSaas, error: true };
    renderShell();
    expect(within(menu()).getByRole('link', { name: 'Dinheiro' })).toHaveAttribute('href', '/admin/dinheiro');
    expect(within(menu()).getByRole('alert')).toHaveTextContent('Não deu para ler o modo da plataforma');
    expect(within(menu()).getByRole('alert')).toHaveTextContent('As abas que dependem do modo ficam escondidas até a leitura voltar.');
    expect(within(menu()).getByRole('alert')).not.toHaveTextContent('áreas de dinheiro');
    fireEvent.click(within(menu()).getByRole('button', { name: 'Tentar de novo' }));
    expect(mockSaas.retry).toHaveBeenCalledTimes(1);
  });

  it('gerente de motoboys: só Verificações, com o contador; rodapé com nome e papel', () => {
    mockUser = GERENTE_MOTOBOYS;
    mockPerms = ['notification:create', 'user:view_motoboys', 'verification:view_queue', 'verification:review_motoboys'];
    mockPath = '/admin/verificacoes';
    mockAsPath = '/admin/verificacoes';
    mockBadges = { verifications: 3, storeOrders: 0, deliveries: 0 };
    renderShell();
    expect(links()).toHaveLength(1);
    const v = within(menu()).getByRole('link', { name: /Verificações/ });
    expect(v).toHaveAttribute('aria-current', 'page');
    expect(within(v).getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText('Gerente de motoboys')).toBeInTheDocument();
  });

  it('CEO: rodapé com "CEO" e sem contador quando não há verificação pendente', () => {
    renderShell();
    expect(screen.getByText('Marina Rocha')).toBeInTheDocument();
    expect(screen.getByText('CEO')).toBeInTheDocument();
    expect(within(menu()).getByRole('link', { name: 'Verificações' })).toBeInTheDocument();
  });
});

describe('AdminShell · data e hora', () => {
  afterEach(() => jest.useRealTimers());

  it('formatAdminNow: "Dia, D de mês · HH:MM"', () => {
    expect(formatAdminNow(new Date(2026, 9, 15, 15, 42))).toBe('Quinta, 15 de outubro · 15:42');
    expect(formatAdminNow(new Date(2026, 9, 14, 9, 5))).toBe('Quarta, 14 de outubro · 09:05');
  });

  it('o cabeçalho mostra a hora atual e atualiza', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 15, 15, 42, 0));
    renderShell();
    expect(screen.getByText('Quinta, 15 de outubro · 15:42')).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(60_000); });
    expect(screen.getByText('Quinta, 15 de outubro · 15:43')).toBeInTheDocument();
  });
});

describe('AdminShell · gaveta no celular', () => {
  const abrir = () => screen.getByRole('button', { name: 'Abrir menu' });
  const lateral = () => screen.getByRole('complementary', { name: 'Menu do admin' });
  const aberta = () => abrir().getAttribute('aria-expanded') === 'true';

  it('abre pelo botão e fecha no Esc, no X, no fundo escuro, ao tocar num item e ao mudar de rota', () => {
    const { rerender } = renderShell();
    expect(aberta()).toBe(false);
    expect(lateral().className).not.toContain('open');

    fireEvent.click(abrir());
    expect(aberta()).toBe(true);
    expect(lateral().className).toContain('open');
    expect(abrir()).toHaveAttribute('aria-controls', lateral().id);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(aberta()).toBe(false);

    fireEvent.click(abrir());
    fireEvent.click(screen.getByRole('button', { name: 'Fechar menu' }));
    expect(aberta()).toBe(false);

    fireEvent.click(abrir());
    fireEvent.click(screen.getByTestId('admin-scrim'));
    expect(aberta()).toBe(false);

    fireEvent.click(abrir());
    fireEvent.click(within(menu()).getByRole('link', { name: 'Usuários' }));
    expect(aberta()).toBe(false);

    fireEvent.click(abrir());
    mockPath = '/admin/users';
    mockAsPath = '/admin/users';
    rerender(<AdminShell title="Usuários"><p>conteúdo</p></AdminShell>);
    expect(aberta()).toBe(false);
    expect(screen.queryByTestId('admin-scrim')).toBeNull();
  });
});

describe('AdminShell · erro de render', () => {
  it('a tela que quebra vira erro com "Tentar de novo" e a casca continua', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const Boom = () => { throw new Error('quebrou'); };
    renderShell(<Boom />);
    expect(screen.getByText('Não deu para abrir esta tela')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Dinheiro · Repasses' })).toBeInTheDocument();
    expect(menu()).toBeInTheDocument();
    spy.mockRestore();
  });
});
