import { renderHook, waitFor } from '@testing-library/react';
import api from '../../lib/api';
import { useCardFeeConfig, CARD_FEE_DEFAULTS, __resetCardFeeConfigCache } from '../useCardFeeConfig';

jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;
beforeEach(() => { __resetCardFeeConfigCache(); get.mockReset(); });

it('lê a configuração e completa o que faltar com os padrões', async () => {
  get.mockResolvedValue({ data: { cardFeePercent: 3.5, cardInstallmentMaxCount: 6 } });
  const { result } = renderHook(() => useCardFeeConfig());
  await waitFor(() => expect(result.current).toEqual({ ...CARD_FEE_DEFAULTS, cardFeePercent: 3.5, cardInstallmentMaxCount: 6 }));
});
it('erro usa os padrões', async () => {
  get.mockRejectedValue(new Error('500'));
  const { result } = renderHook(() => useCardFeeConfig());
  await waitFor(() => expect(result.current).toEqual(CARD_FEE_DEFAULTS));
});
