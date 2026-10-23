import { render, screen, within } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';
import { AdminTabs } from '../AdminTabs';
import AdminShell from '../AdminShell';

let mockPath = '/admin/payouts';
let mockQuery: Record<string, string> = {};
jest.mock('next/router', () => ({
  useRouter: () => ({ pathname: mockPath, asPath: mockPath, query: mockQuery, push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('next/link', () => {
  const R = require('react');
  return {
    __esModule: true,
    default: R.forwardRef(({ href, children, ...rest }: { href: string; children?: ReactNode }, ref: React.Ref<HTMLAnchorElement>) => (
      <a ref={ref} href={href} {...rest}>{children}</a>
    )),
  };
});

let mockRole = 'ceo';
let mockPerms: string[] = [];
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'u1', id: 'u1', name: 'Marina', role: mockRole, activeRole: mockRole },
    can: (p: string) => mockRole === 'ceo' || mockPerms.includes(p),
  }),
}));
let mockSaas = { settlementMode: 'custodia', directCardEnabled: false, loading: false, error: false, retry: jest.fn() };
jest.mock('../../../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas }));
let mockCustodyOpen = false;
jest.mock('../../../hooks/useAdminCustodyOpen', () => ({ useAdminCustodyOpen: () => mockCustodyOpen }));
jest.mock('../../../hooks/useSync', () => ({ useBadgeCounts: () => ({ verifications: 0, storeOrders: 0, deliveries: 0 }) }));
jest.mock('../../nav/AccountMenuButton', () => ({ __esModule: true, default: () => null }));

const scrollSpy = jest.fn();
beforeAll(() => { Element.prototype.scrollIntoView = scrollSpy; });
beforeEach(() => {
  mockPath = '/admin/payouts';
  mockQuery = {};
  mockRole = 'ceo';
  mockPerms = [];
  mockSaas = { settlementMode: 'custodia', directCardEnabled: false, loading: false, error: false, retry: jest.fn() };
  mockCustodyOpen = false;
  scrollSpy.mockClear();
});

const tabs = (name: string) => within(screen.getByRole('navigation', { name })).getAllByRole('link');

describe('AdminTabs', () => {
  it('Dinheiro na custódia (CEO): Visão geral, as 4 abas do modo e Histórico; a da página ativa e rolada para a vista', () => {
    render(<AdminTabs area="dinheiro" />);
    expect(tabs('Abas de Dinheiro').map((a) => a.textContent)).toEqual(['Visão geral', 'Repasses', 'Saques', 'Carteiras', 'Caixa', 'Histórico']);
    const ativa = screen.getByRole('link', { name: 'Repasses' });
    expect(ativa).toHaveAttribute('aria-current', 'page');
    expect(ativa).toHaveAttribute('href', '/admin/payouts');
    expect(screen.getByRole('link', { name: 'Saques' })).not.toHaveAttribute('aria-current');
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'nearest', inline: 'center' });
  });

  it('Dinheiro no direto com custódia em aberto: Visão geral, Repasses, Saques, Estornos, Pix, Mensalidades e Histórico', () => {
    mockSaas = { ...mockSaas, settlementMode: 'direto' };
    mockCustodyOpen = true;
    mockPath = '/admin/transfers';
    render(<AdminTabs area="dinheiro" />);
    expect(tabs('Abas de Dinheiro').map((a) => a.textContent)).toEqual(['Visão geral', 'Repasses', 'Saques', 'Estornos', 'Pix aos motoboys', 'Mensalidades', 'Histórico']);
    expect(screen.getByRole('link', { name: 'Pix aos motoboys' })).toHaveAttribute('aria-current', 'page');
  });

  it('modo desconhecido: nenhuma aba de modo; só Visão geral e Histórico', () => {
    mockSaas = { ...mockSaas, loading: true };
    render(<AdminTabs area="dinheiro" />);
    expect(tabs('Abas de Dinheiro').map((a) => a.textContent)).toEqual(['Visão geral', 'Histórico']);
  });

  it('área com uma aba só visível ao papel: sem barra', () => {
    mockRole = 'gerente_geral';
    mockPerms = ['wallet:view_all'];
    mockPath = '/admin/wallets';
    const { container } = render(<AdminTabs area="dinheiro" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('papel sem a permissão de uma aba não a vê (e com uma aba só a barra some)', () => {
    mockRole = 'gerente_lojistas';
    mockPerms = ['payout:view'];
    const { container } = render(<AdminTabs area="dinheiro" />);
    expect(container).toBeEmptyDOMElement();
    mockPerms = ['payout:view', 'withdrawal:view'];
    render(<AdminTabs area="dinheiro" />);
    expect(tabs('Abas de Dinheiro').map((a) => a.textContent)).toEqual(['Repasses', 'Saques']);
  });

  it('Avisos e broadcasts: Avisos e Cupons só para o CEO', () => {
    mockPath = '/admin/broadcasts';
    render(<AdminTabs area="comunicacao" />);
    expect(tabs('Abas de Avisos e broadcasts').map((a) => a.textContent)).toEqual(['Broadcasts', 'Avisos da home', 'Cupons']);
  });

  it('AdminShell com tabs mostra a barra da área; sem tabs, não', () => {
    const a = render(<AdminShell title="Dinheiro · Repasses" tabs="dinheiro"><p>x</p></AdminShell>);
    expect(screen.getByRole('navigation', { name: 'Abas de Dinheiro' })).toBeInTheDocument();
    a.unmount();
    render(<AdminShell title="Dinheiro · Repasses"><p>x</p></AdminShell>);
    expect(screen.queryByRole('navigation', { name: 'Abas de Dinheiro' })).toBeNull();
  });
});
