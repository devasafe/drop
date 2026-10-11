import { renderHook } from '@testing-library/react';

const push = jest.fn();
const showToast = jest.fn();
const add = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push }) }));
jest.mock('../../components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));
jest.mock('../../contexts/CartContext', () => ({ useCart: () => ({ add }) }));

import { useAddToCart } from '../useAddToCart';
import { ROUTES } from '../../lib/routes';

beforeEach(() => { push.mockClear(); showToast.mockClear(); add.mockReset(); });

test('item entrou: toast com "Ver sacola" que leva à sacola', () => {
  add.mockImplementation((_item, opts) => { opts?.onAdded?.(); return 'added'; });
  const { result } = renderHook(() => useAddToCart());
  expect(result.current({ productId: 'p1', quantity: 1, name: 'Fone', price: 10, storeId: 's1' })).toBe('added');
  expect(showToast).toHaveBeenCalledWith('Adicionado à sacola', 'success', expect.objectContaining({ action: expect.objectContaining({ label: 'Ver sacola' }) }));
  showToast.mock.calls[0][2].action.onClick();
  expect(push).toHaveBeenCalledWith(ROUTES.sacola);
});

test('troca de loja pendente: sem toast', () => {
  add.mockReturnValue('swap');
  const { result } = renderHook(() => useAddToCart());
  expect(result.current({ productId: 'p1', quantity: 1, name: 'Fone', price: 10, storeId: 's2' })).toBe('swap');
  expect(showToast).not.toHaveBeenCalled();
});
