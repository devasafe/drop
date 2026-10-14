/**
 * V16 · useBadgeCounts compartilha uma leitura de /badges entre as instâncias
 * (Nav, AppSidebar e PanelBottomNav montam o hook ao mesmo tempo no painel da loja).
 */
import { act, render, screen } from '@testing-library/react';

type Handler = (...args: any[]) => void;
const mockHandlers = new Map<string, Set<Handler>>();
const mockOn = (event: string, h: Handler) => {
  if (!mockHandlers.has(event)) mockHandlers.set(event, new Set());
  mockHandlers.get(event)!.add(h);
  return () => mockHandlers.get(event)?.delete(h);
};
const fire = (event: string) => mockHandlers.get(event)?.forEach((h) => h());
jest.mock('../../contexts/SocketContext', () => ({ useSocket: () => ({ on: mockOn }) }));

let mockStoreOrders = 2;
const mockGet = jest.fn((_url: string) =>
  Promise.resolve({ data: { verifications: 0, storeOrders: mockStoreOrders, deliveries: 0 } }),
);
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: (url: string) => mockGet(url) } }));

// eslint-disable-next-line import/first
import { useBadgeCounts, resetBadgeCountsCache } from '../useSync';

const badgeCalls = () => mockGet.mock.calls.filter(([u]) => u === '/badges').length;
const Badge = ({ id }: { id: string }) => {
  const c = useBadgeCounts();
  return <span data-testid={id}>{c.storeOrders}</span>;
};
const Trio = () => (
  <>
    <Badge id="a" />
    <Badge id="b" />
    <Badge id="c" />
  </>
);

beforeEach(() => {
  jest.useFakeTimers();
  resetBadgeCountsCache();
  mockHandlers.clear();
  mockGet.mockClear();
  mockStoreOrders = 2;
  localStorage.setItem('user', JSON.stringify({ _id: 'u1', role: 'lojista' }));
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  localStorage.clear();
});

describe('useBadgeCounts · leitura compartilhada (V16)', () => {
  it('três instâncias montadas juntas fazem 1 GET /badges e todas recebem o número', async () => {
    render(<Trio />);
    await act(async () => {});
    expect(badgeCalls()).toBe(1);
    expect(['a', 'b', 'c'].map((id) => screen.getByTestId(id).textContent)).toEqual(['2', '2', '2']);
  });

  it('uma rajada de eventos refaz 1 GET (debounce compartilhado) e atualiza todas', async () => {
    render(<Trio />);
    await act(async () => {});
    mockStoreOrders = 5;
    act(() => {
      fire('new_order');
      fire('order:status_changed');
      fire('notification:received');
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(badgeCalls()).toBe(2);
    expect(['a', 'b', 'c'].map((id) => screen.getByTestId(id).textContent)).toEqual(['5', '5', '5']);
  });

  it('instância que monta depois, com o número recente, não pede de novo', async () => {
    const { rerender } = render(<Badge id="a" />);
    await act(async () => {});
    rerender(
      <>
        <Badge id="a" />
        <Badge id="b" />
      </>,
    );
    await act(async () => {});
    expect(badgeCalls()).toBe(1);
    expect(screen.getByTestId('b').textContent).toBe('2');
  });

  it('outro usuário logado não herda o número do anterior', async () => {
    const { unmount } = render(<Badge id="a" />);
    await act(async () => {});
    unmount();
    localStorage.setItem('user', JSON.stringify({ _id: 'u2', role: 'lojista' }));
    mockStoreOrders = 7;
    render(<Badge id="z" />);
    expect(screen.getByTestId('z').textContent).toBe('0');
    await act(async () => {});
    expect(badgeCalls()).toBe(2);
    expect(screen.getByTestId('z').textContent).toBe('7');
  });

  it('sem usuário não pede nada', async () => {
    localStorage.clear();
    render(<Trio />);
    await act(async () => {});
    expect(badgeCalls()).toBe(0);
  });
});
