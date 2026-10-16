/**
 * Revisão final I5 — no modo direto, Repasses e Saques continuam no menu do admin (lib/adminNav desde a D3a) enquanto
 * houver repasse de custódia ou saque em aberto (GET /admin/custody-open).
 */
import { renderHook, waitFor } from '@testing-library/react';
import { visibleAdminAreas } from '../lib/adminNav';

const mockGet = jest.fn();
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: (...a: any[]) => mockGet(...a) } }));
const mockAuth = jest.fn();
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth() }));
const mockSaas = jest.fn();
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas() }));

import { useAdminCustodyOpen, __resetAdminCustodyOpenCache } from '../hooks/useAdminCustodyOpen';

const tabLabels = (settlementMode: 'custodia' | 'direto', custodyOpen: boolean, can: (p: string) => boolean = () => true, isCeo = true) =>
  visibleAdminAreas({ can, isCeo, settlementMode, custodyOpen }).flatMap((a) => a.tabs.map((t) => t.label));

describe('menu do admin (lib/adminNav) — modo direto com custódia em aberto', () => {
  it('direto + custódia em aberto: Repasses e Saques aparecem; Carteiras/Caixa/Planos continuam fora', () => {
    const l = tabLabels('direto', true);
    expect(l).toEqual(expect.arrayContaining(['Repasses', 'Saques']));
    for (const x of ['Carteiras', 'Caixa', 'Planos']) expect(l).not.toContain(x);
  });

  it('direto sem custódia em aberto: Repasses e Saques somem', () => {
    const l = tabLabels('direto', false);
    expect(l).not.toContain('Repasses');
    expect(l).not.toContain('Saques');
  });

  it('respeita a permissão de cada aba', () => {
    const l = tabLabels('direto', true, (p) => p === 'payout:view', false);
    expect(l).toContain('Repasses');
    expect(l).not.toContain('Saques');
  });
});

describe('useAdminCustodyOpen', () => {
  beforeEach(() => {
    __resetAdminCustodyOpenCache();
    mockGet.mockReset();
    mockAuth.mockReturnValue({ user: { _id: 'a1', id: 'a1', role: 'ceo' }, can: () => true });
  });

  it('modo direto com payout:view: usa o booleano do backend', async () => {
    mockSaas.mockReturnValue({ settlementMode: 'direto' });
    mockGet.mockResolvedValue({ data: { success: true, data: { open: true, openPayouts: 2, openWithdrawals: 0 } } });
    const { result } = renderHook(() => useAdminCustodyOpen());
    await waitFor(() => expect(result.current).toBe(true));
    expect(mockGet).toHaveBeenCalledWith('/admin/custody-open');
  });

  it('erro → false', async () => {
    mockSaas.mockReturnValue({ settlementMode: 'direto' });
    mockGet.mockRejectedValue(new Error('500'));
    const { result } = renderHook(() => useAdminCustodyOpen());
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it('custódia, sem payout:view ou deslogado: nem consulta', () => {
    mockSaas.mockReturnValue({ settlementMode: 'custodia' });
    expect(renderHook(() => useAdminCustodyOpen()).result.current).toBe(false);
    mockSaas.mockReturnValue({ settlementMode: 'direto' });
    mockAuth.mockReturnValue({ user: { _id: 'l1', id: 'l1', role: 'lojista' }, can: () => false });
    expect(renderHook(() => useAdminCustodyOpen()).result.current).toBe(false);
    mockAuth.mockReturnValue({ user: null, can: () => false });
    expect(renderHook(() => useAdminCustodyOpen()).result.current).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
