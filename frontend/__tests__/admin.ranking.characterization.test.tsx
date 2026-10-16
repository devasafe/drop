/**
 * Caracterização do Ranking: roda em /admin/ranking-config (antiga) e em /admin/settings?aba=ranking (nova).
 * Mesmas leituras, mesmos corpos de salvar, distribuir e liga/desliga.
 */
import type { ComponentType } from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { confirmIfAsked, renderAdminPage, stubNativeDialogs } from './helpers/adminPage';
import api from '../lib/api';
import OldRankingConfig from '../pages/admin/ranking-config';
import AdminSettings from '../pages/admin/settings';

let mockQuery: Record<string, string> = {};
const mockRouter = { pathname: '/admin/settings', asPath: '/admin/settings', push: jest.fn(), replace: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => ({ ...mockRouter, query: mockQuery }) }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
const mockToast = jest.fn();
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const PRIZES = [
  { position: 1, amount: 500, type: 'wallet' },
  { position: 2, amount: 300, type: 'wallet' },
  { position: 3, amount: 150, type: 'wallet' },
];
const CURRENT = { month: 10, year: 2026, prizes: PRIZES, distributed: false };
const HISTORY = [{ month: 9, year: 2026, prizes: PRIZES, distributedAt: '2026-10-01T12:00:00.000Z', distributedBy: { name: 'Asafe' } }];

const PAGES: Array<[string, ComponentType]> = [
  ['ranking-config (antiga)', OldRankingConfig],
  ['settings?aba=ranking (nova)', AdminSettings],
];

describe.each(PAGES)('%s', (_name, Page) => {
  beforeEach(() => {
    jest.clearAllMocks();
    stubNativeDialogs();
    mockQuery = { aba: 'ranking' };
    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/ranking-prizes') return Promise.resolve({ data: CURRENT });
      if (url === '/ranking-prizes/history') return Promise.resolve({ data: HISTORY });
      if (url === '/ranking-prizes/config-status') return Promise.resolve({ data: { rankingPrizesEnabled: true } });
      return Promise.reject(new Error(`GET inesperado: ${url}`));
    });
    (api.put as jest.Mock).mockResolvedValue({ data: { rankingPrizesEnabled: false } });
    (api.post as jest.Mock).mockResolvedValue({ data: { success: true, results: [{ credited: true }, { credited: true }, { credited: false }] } });
  });

  const loaded = async () => {
    await screen.findByRole('button', { name: 'Pausar prêmios' });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
  };

  it('lê prêmios, histórico e situação', async () => {
    renderAdminPage(<Page />);
    await loaded();
    expect(api.get).toHaveBeenCalledWith('/ranking-prizes');
    expect(api.get).toHaveBeenCalledWith('/ranking-prizes/history');
    expect(api.get).toHaveBeenCalledWith('/ranking-prizes/config-status');
  });

  it('salvar: PUT /ranking-prizes com a lista inteira de prêmios', async () => {
    renderAdminPage(<Page />);
    await loaded();
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '600' } });
    fireEvent.click(screen.getByRole('button', { name: /^Salvar/ }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/ranking-prizes', {
      prizes: [{ position: 1, amount: 600, type: 'wallet' }, PRIZES[1], PRIZES[2]],
    }));
  });

  it('distribuir: confirma e faz POST /ranking-prizes/distribute com {}', async () => {
    renderAdminPage(<Page />);
    await loaded();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Distribuir prêmios$/i })); });
    await confirmIfAsked(/^Distribuir prêmios$/i);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ranking-prizes/distribute', {}));
    // antiga: mensagem na tela; nova: toast
    await waitFor(() => expect(screen.queryByText(/Prêmios distribuídos! 2 carteira/) ?? (mockToast.mock.calls.length ? true : null)).toBeTruthy());
    await waitFor(() => expect((api.get as jest.Mock).mock.calls.filter((c) => c[0] === '/ranking-prizes').length).toBe(2));
    await screen.findByRole('button', { name: /^Distribuir prêmios$/i }); // antiga: volta de "..." ao fim do envio
  });

  it('pausar: PUT /ranking-prizes/config-status { enabled: false }', async () => {
    renderAdminPage(<Page />);
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Pausar prêmios' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/ranking-prizes/config-status', { enabled: false }));
  });
});
