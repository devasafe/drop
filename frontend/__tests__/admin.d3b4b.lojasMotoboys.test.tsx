/**
 * D3b-4b · P3.5 — Lojas (spec 7.2): coluna "Motoboys por perto" ("N online · M livres", "—" sem ponto no mapa),
 * filtro "Sem motoboy por perto" no servidor com o raio que vem do servidor, vazio próprio e formato estrito.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import AdminLojasPage from '../pages/admin/lojas';
import {
  fetchStores, isStoreListResponse, nearbyCouriersLabel, noCourierHint,
} from '../lib/adminAccounts';
import { adminAuth, renderAdminPage } from './helpers/adminPage';
import { resetViewport, setViewportWidth } from './helpers/viewport';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, isReady: true, pathname: '/admin/lojas', asPath: '/admin/lojas' }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));

const get = api.get as jest.Mock;
const loja = (over: Record<string, unknown> = {}) => ({
  id: 's1', name: 'Eletro Center', ownerName: 'Renato Nunes', plan: 2, mode: 'custodia', rating90d: 4.8,
  cancelRate30d: 0.125, receiving: 'ok', situation: 'open', attention: false, nearbyCouriers: { online: 3, free: 2 }, ...over,
});
const page = (items: unknown[], nextCursor: string | null = null, nearbyRadiusKm = 12) => ({ data: { items, nextCursor, nearbyRadiusKm } });
const renderList = () => renderAdminPage(<AdminLojasPage />, adminAuth('gerente_lojistas', ['store:view_all']));
const rowOf = (name: string) => screen.getByRole('link', { name }).closest('tr') as HTMLElement;
const filtros = () => screen.getByRole('group', { name: 'Filtrar lojas' });

beforeEach(() => jest.clearAllMocks());
afterEach(() => resetViewport());

describe('lib · motoboys por perto', () => {
  it('nearbyCouriersLabel: "N online · M livres", singular e "—" sem ponto no mapa', () => {
    expect(nearbyCouriersLabel({ online: 3, free: 2 })).toBe('3 online · 2 livres');
    expect(nearbyCouriersLabel({ online: 4, free: 1 })).toBe('4 online · 1 livre');
    expect(nearbyCouriersLabel({ online: 0, free: 0 })).toBe('0 online · 0 livres');
    expect(nearbyCouriersLabel(null)).toBe('—');
  });

  it('noCourierHint usa o raio do servidor, com vírgula decimal', () => {
    expect(noCourierHint(12)).toBe('Só lojas abertas agora, sem nenhum motoboy online a até 12 km.');
    expect(noCourierHint(7.5)).toBe('Só lojas abertas agora, sem nenhum motoboy online a até 7,5 km.');
  });

  it('isStoreListResponse exige nearbyRadiusKm e nearbyCouriers no formato', () => {
    expect(isStoreListResponse({ items: [loja()], nextCursor: null, nearbyRadiusKm: 12 })).toBe(true);
    expect(isStoreListResponse({ items: [loja({ nearbyCouriers: null })], nextCursor: null, nearbyRadiusKm: 12 })).toBe(true);
    expect(isStoreListResponse({ items: [loja()], nextCursor: null })).toBe(false);
    expect(isStoreListResponse({ items: [loja({ nearbyCouriers: { online: 1 } })], nextCursor: null, nearbyRadiusKm: 12 })).toBe(false);
    expect(isStoreListResponse({ items: [loja({ nearbyCouriers: undefined })], nextCursor: null, nearbyRadiusKm: 12 })).toBe(false);
  });

  it('fetchStores manda filter=no_courier', async () => {
    get.mockResolvedValue(page([loja()]));
    await fetchStores({ filter: 'no_courier' });
    expect(get).toHaveBeenLastCalledWith('/admin/stores?filter=no_courier');
  });
});

describe('Lojas · coluna e filtro', () => {
  it('coluna "Motoboys por perto" em cada linha; "—" na loja sem ponto no mapa (Review Focus 1)', async () => {
    get.mockResolvedValue(page([
      loja(),
      loja({ id: 's2', name: 'Sabor da Vila', nearbyCouriers: { online: 1, free: 1 } }),
      loja({ id: 's3', name: 'Casa Norte', nearbyCouriers: null }),
    ]));
    renderList();
    await screen.findByRole('link', { name: 'Eletro Center' });
    expect(screen.getByRole('columnheader', { name: 'Motoboys por perto' })).toBeInTheDocument();
    expect(within(rowOf('Eletro Center')).getByText('3 online · 2 livres')).toBeInTheDocument();
    expect(within(rowOf('Sabor da Vila')).getByText('1 online · 1 livre')).toBeInTheDocument();
    expect(within(rowOf('Casa Norte')).getByText('—')).toBeInTheDocument();
  });

  it('"Sem motoboy por perto" vai ao servidor e explica o filtro com o raio do servidor', async () => {
    get.mockResolvedValueOnce(page([loja()]))
      .mockResolvedValueOnce(page([loja({ nearbyCouriers: { online: 0, free: 0 } })], null, 7.5));
    renderList();
    await screen.findByRole('link', { name: 'Eletro Center' });
    expect(screen.queryByText(/Só lojas abertas agora/)).toBeNull();
    expect(within(filtros()).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Todas', 'Pausadas pelo DROP', 'Precisam de atenção', 'Em teste', 'Sem motoboy por perto']);
    fireEvent.click(within(filtros()).getByRole('button', { name: 'Sem motoboy por perto' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/admin/stores?filter=no_courier'));
    expect(await screen.findByText('Só lojas abertas agora, sem nenhum motoboy online a até 7,5 km.')).toBeInTheDocument();
    expect(within(rowOf('Eletro Center')).getByText('0 online · 0 livres')).toBeInTheDocument();
    expect(within(filtros()).getByRole('button', { name: 'Sem motoboy por perto' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('filtro sem resultado: mensagem própria', async () => {
    get.mockResolvedValueOnce(page([loja()])).mockResolvedValueOnce(page([]));
    renderList();
    await screen.findByRole('link', { name: 'Eletro Center' });
    fireEvent.click(within(filtros()).getByRole('button', { name: 'Sem motoboy por perto' }));
    expect(await screen.findByText('Toda loja aberta tem motoboy por perto agora')).toBeInTheDocument();
  });

  it('nearbyCouriers fora do formato: erro com "Tentar de novo", nunca um zero inventado', async () => {
    get.mockResolvedValueOnce({ data: { items: [loja({ nearbyCouriers: { online: 1 } })], nextCursor: null, nearbyRadiusKm: 12 } })
      .mockResolvedValueOnce(page([loja()]));
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar as lojas.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('link', { name: 'Eletro Center' })).toBeInTheDocument();
  });

  it('sem nearbyRadiusKm: erro com "Tentar de novo"', async () => {
    get.mockResolvedValueOnce({ data: { items: [loja()], nextCursor: null } }).mockResolvedValueOnce(page([loja()]));
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar as lojas.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('link', { name: 'Eletro Center' })).toBeInTheDocument();
  });

  it('393 px: o cartão mostra os motoboys por perto', async () => {
    setViewportWidth(393);
    get.mockResolvedValue(page([loja()]));
    renderList();
    await screen.findByRole('link', { name: 'Eletro Center' });
    const cards = within(screen.getByRole('list', { name: 'Lojas' })).getAllByRole('listitem');
    expect(within(cards[0]).getByText('Motoboys por perto')).toBeInTheDocument();
    expect(within(cards[0]).getByText('3 online · 2 livres')).toBeInTheDocument();
  });
});
