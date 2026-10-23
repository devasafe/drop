/**
 * D3b-4b · P2.2 — ficha da loja, bloco "Motoboys por perto" (spec 7.2): "N online a até X km agora, M livres", com
 * o raio vindo do servidor; sem coordenada, "A loja não tem ponto no mapa"; resposta sem os campos novos é recusada
 * (fail closed).
 */
import { screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import { isStoreDetail, nearbyCouriersText } from '../lib/adminAccounts';
import AdminLojaFichaPage from '../pages/admin/lojas/[id]';
import { adminAuth, renderAdminPage } from './helpers/adminPage';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: { id: 's1' }, isReady: true, pathname: '/admin/lojas/[id]', asPath: '/admin/lojas/s1' }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));

const get = api.get as jest.Mock;

const DETAIL = {
  profile: {
    id: 's1', name: 'Eletro Center', cnpj: null, owner: { id: 'p9', name: 'Renato Nunes' }, city: 'São Paulo',
    situation: 'open', adminPause: null,
  },
  stats30d: { orders: 120, cancelledByStore: 3, rating: 4.7 },
  reviews: [],
  receiving: { status: 'ok', detail: null },
  plan: { plan: 2, mode: 'custodia', saas: null },
  orders: [],
  timeline: { items: [], nextCursor: null },
  can: { pause: false, unpause: false, note: true, extendTrial: false, cancelSaas: false },
  nearbyCouriers: { online: 4, free: 1 },
  nearbyRadiusKm: 12,
};
const sem = <T extends object>(o: T, k: string) => { const c = { ...o } as Record<string, unknown>; delete c[k]; return c; };

const bloco = () => screen.findByRole('region', { name: 'Motoboys por perto' });

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({ data: DETAIL });
});

describe('ficha da loja · motoboys por perto', () => {
  it('N online no raio e M livres, com o título do bloco', async () => {
    renderAdminPage(<AdminLojaFichaPage />, adminAuth('ceo'));
    const b = await bloco();
    expect(within(b).getByRole('heading', { name: 'Motoboys por perto' })).toBeInTheDocument();
    expect(b).toHaveTextContent('4 online a até 12 km agora, 1 livre');
  });

  it('o raio é o do servidor, e o plural de livres', async () => {
    get.mockResolvedValue({ data: { ...DETAIL, nearbyCouriers: { online: 0, free: 0 }, nearbyRadiusKm: 9.5 } });
    renderAdminPage(<AdminLojaFichaPage />, adminAuth('ceo'));
    expect(await bloco()).toHaveTextContent('0 online a até 9,5 km agora, 0 livres');
  });

  it('loja sem coordenada: "A loja não tem ponto no mapa"', async () => {
    get.mockResolvedValue({ data: { ...DETAIL, nearbyCouriers: null } });
    renderAdminPage(<AdminLojaFichaPage />, adminAuth('ceo'));
    const b = await bloco();
    expect(b).toHaveTextContent('A loja não tem ponto no mapa');
    expect(b).not.toHaveTextContent('online');
  });

  it('formato: os campos novos são obrigatórios; null aceito só em nearbyCouriers', () => {
    expect(isStoreDetail(DETAIL)).toBe(true);
    expect(isStoreDetail({ ...DETAIL, nearbyCouriers: null })).toBe(true);
    expect(isStoreDetail(sem(DETAIL, 'nearbyCouriers'))).toBe(false);
    expect(isStoreDetail(sem(DETAIL, 'nearbyRadiusKm'))).toBe(false);
    expect(isStoreDetail({ ...DETAIL, nearbyRadiusKm: null })).toBe(false);
    expect(isStoreDetail({ ...DETAIL, nearbyCouriers: { online: '4', free: 1 } })).toBe(false);
    expect(isStoreDetail({ ...DETAIL, nearbyCouriers: { online: 4 } })).toBe(false);
  });

  it('texto: singular e plural', () => {
    expect(nearbyCouriersText({ online: 1, free: 1 }, 12)).toBe('1 online a até 12 km agora, 1 livre');
    expect(nearbyCouriersText({ online: 3, free: 2 }, 12)).toBe('3 online a até 12 km agora, 2 livres');
  });
});
