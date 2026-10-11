import { renderHook, act } from '@testing-library/react';

const push = jest.fn();
const showToast = jest.fn();
const reorder = jest.fn();
let mockCart: any[] = [];
jest.mock('next/router', () => ({ useRouter: () => ({ push }) }));
jest.mock('../../components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));
jest.mock('../../contexts/CartContext', () => ({ useCart: () => ({ cart: mockCart }) }));
jest.mock('../useReorder', () => ({ useReorder: () => ({ reorder }) }));
import { useReorderFlow } from '../useReorderFlow';
import { ROUTES } from '../../lib/routes';

const order = { _id: 'o1', storeId: 's2', storeName: 'Pet&Cia' };
beforeEach(() => { push.mockClear(); showToast.mockClear(); reorder.mockReset(); mockCart = []; });

test('sacola vazia: recompra direto e vai para a sacola', async () => {
  reorder.mockResolvedValue({ storeId: 's2', storeName: 'Pet&Cia', added: 2, skipped: [], priceChanged: [] });
  const { result } = renderHook(() => useReorderFlow());
  await act(async () => { result.current.start(order); });
  expect(reorder).toHaveBeenCalledWith('o1');
  expect(showToast).toHaveBeenCalledWith('2 itens na sacola', 'success');
  expect(push).toHaveBeenCalledWith(ROUTES.sacola);
});

test('sacola com itens de outra loja: pergunta antes e só recompra ao confirmar', async () => {
  mockCart = [{ productId: 'a', quantity: 2, storeId: 's1', storeName: 'Eletro Center' }];
  reorder.mockResolvedValue({ storeId: 's2', storeName: 'Pet&Cia', added: 1, skipped: [{}], priceChanged: [{}] });
  const { result } = renderHook(() => useReorderFlow());
  act(() => { result.current.start(order); });
  expect(reorder).not.toHaveBeenCalled();
  expect(result.current.confirm).toMatchObject({ open: true, currentCount: 2, currentStoreName: 'Eletro Center', targetStoreName: 'Pet&Cia', sameStore: false });
  await act(async () => { result.current.confirm.onConfirm(); });
  expect(reorder).toHaveBeenCalledWith('o1');
  expect(showToast).toHaveBeenCalledWith('1 item na sacola · 1 indisponíveis · preço mudou em 1', 'success');
});

test('nada disponível: avisa e não navega', async () => {
  reorder.mockResolvedValue({ storeId: 's2', storeName: 'Pet&Cia', added: 0, skipped: [{}], priceChanged: [] });
  const { result } = renderHook(() => useReorderFlow());
  await act(async () => { result.current.start(order); });
  expect(showToast).toHaveBeenCalledWith('Nenhum item deste pedido está disponível agora.', 'error');
  expect(push).not.toHaveBeenCalled();
});

test('erro de rede', async () => {
  reorder.mockRejectedValue(new Error('net'));
  const { result } = renderHook(() => useReorderFlow());
  await act(async () => { result.current.start(order); });
  expect(showToast).toHaveBeenCalledWith('Não conseguimos montar a sacola. Tente de novo.', 'error');
});
