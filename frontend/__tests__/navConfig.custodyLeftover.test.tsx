/**
 * P16 — "Saldo do modo anterior": aparece só no modo direto e só para quem o backend
 * diz que ainda tem saldo da custódia (GET /settings/custody-leftover).
 */
import { renderHook, waitFor } from '@testing-library/react';
import { getNavItems } from '../lib/navConfig';

const mockGet = jest.fn();
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: (...a: any[]) => mockGet(...a) } }));
const mockAuth = jest.fn();
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth() }));
const mockSaas = jest.fn();
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas() }));

import { useCustodyLeftover, __resetCustodyLeftoverCache } from '../hooks/useCustodyLeftover';

const LABEL = 'Saldo do modo anterior';
const allow = () => true;
const labels = (role: any, settlementMode: string, custodyLeftover?: boolean) =>
  getNavItems(role, allow, false, { settlementMode, custodyLeftover }).map((i) => i.label);

describe('navConfig — Saldo do modo anterior', () => {
  it.each(['cliente', 'lojista', 'motoboy'])('%s: direto + saldo → aparece', (role) => {
    expect(labels(role, 'direto', true)).toContain(LABEL);
  });

  it.each(['cliente', 'lojista', 'motoboy'])('%s: direto sem saldo → não aparece', (role) => {
    expect(labels(role, 'direto', false)).not.toContain(LABEL);
    expect(labels(role, 'direto')).not.toContain(LABEL);
  });

  it.each(['cliente', 'lojista', 'motoboy'])('%s: custódia (mesmo com flag) → não aparece', (role) => {
    expect(labels(role, 'custodia', true)).not.toContain(LABEL);
    expect(getNavItems(role as any, allow, false).map((i) => i.label)).not.toContain(LABEL);
  });

  it('leva à tela de saldo/saque da custódia de cada papel', () => {
    const route = (role: any) => getNavItems(role, allow, false, { settlementMode: 'direto', custodyLeftover: true }).find((i) => i.label === LABEL)!.route;
    expect(route('cliente')).toBe('/wallet');
    expect(route('lojista')).toBe('/seller/wallet');
    expect(route('motoboy')).toBe('/motoboy/wallet');
  });
});

describe('useCustodyLeftover', () => {
  beforeEach(() => {
    __resetCustodyLeftoverCache();
    mockGet.mockReset();
    mockAuth.mockReturnValue({ user: { _id: 'u1', id: 'u1' } });
  });

  it('modo direto: usa o booleano do backend', async () => {
    mockSaas.mockReturnValue({ settlementMode: 'direto' });
    mockGet.mockResolvedValue({ data: { hasLeftover: true } });
    const { result } = renderHook(() => useCustodyLeftover());
    await waitFor(() => expect(result.current).toBe(true));
    expect(mockGet).toHaveBeenCalledWith('/settings/custody-leftover');
  });

  it('erro na consulta → false (menu escondido)', async () => {
    mockSaas.mockReturnValue({ settlementMode: 'direto' });
    mockGet.mockRejectedValue(new Error('500'));
    const { result } = renderHook(() => useCustodyLeftover());
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it('modo custódia ou deslogado: nem consulta', () => {
    mockSaas.mockReturnValue({ settlementMode: 'custodia' });
    expect(renderHook(() => useCustodyLeftover()).result.current).toBe(false);
    mockSaas.mockReturnValue({ settlementMode: 'direto' });
    mockAuth.mockReturnValue({ user: null });
    expect(renderHook(() => useCustodyLeftover()).result.current).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
