/**
 * V7 (auditoria visual D1, M2): o aviso de verificação sai do painel da loja (o Agora mostra o cadastro)
 * e, fora dele, usa classe com token, sem style inline de cor fixa e sem emoji.
 */
import { render, screen, waitFor } from '@testing-library/react';
import VerificationBanner from '../components/VerificationBanner';

let mockPath = '/motoboy';
let mockRole = 'motoboy';
const mockGet = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ pathname: mockPath, query: {}, push: jest.fn() }) }));
// Objeto estável por papel, como o AuthContext real (senão o efeito do aviso roda a cada render).
const mockUsers: Record<string, { _id: string; activeRole: string }> = {
  motoboy: { _id: 'u1', activeRole: 'motoboy' },
  lojista: { _id: 'u2', activeRole: 'lojista' },
};
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUsers[mockRole], activeRole: mockRole }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: (...a: unknown[]) => mockGet(...a) } }));

beforeEach(() => { mockGet.mockReset(); });

test('fora do painel: classe com token, sem style inline e sem emoji', async () => {
  mockPath = '/motoboy'; mockRole = 'motoboy';
  mockGet.mockResolvedValue({ data: { missing: ['courier'] } });
  const { container } = render(<VerificationBanner />);
  const link = await screen.findByRole('link', { name: /verificar agora/i });
  const box = container.firstElementChild as HTMLElement;
  expect(box.getAttribute('style')).toBeNull();
  expect(link.getAttribute('style')).toBeNull();
  expect(box.className).not.toBe('');
  expect(box.textContent).not.toMatch(/⚠/);
  expect(link).toHaveAttribute('href', '/motoboy/cadastro?etapa=verificacao');
});

test('no painel da loja não busca nada e não aparece', async () => {
  mockPath = '/seller/loja'; mockRole = 'lojista';
  mockGet.mockResolvedValue({ data: { missing: ['owner'], store: { _id: 's1' } } });
  const { container } = render(<VerificationBanner />);
  await new Promise((r) => setTimeout(r, 30));
  await waitFor(() => expect(container).toBeEmptyDOMElement());
  expect(mockGet).not.toHaveBeenCalled();
});
