/**
 * A3: motoboy no modo direto vê "Repasses recebidos" (e não "Ganhos e saques");
 * (/motoboy/wallet no direto: portado para __tests__/motoboy.ganhos.portados.test.tsx na D2 · P4.11);
 * os atalhos do admin no direto foram portados para __tests__/admin-numeros.test.tsx (D3a · P5.1).
 */
import { getNavItems } from '../lib/navConfig';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/' }) }));
let mockRole = 'motoboy';
let mockMode = 'direto';
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'u1', activeRole: mockRole },
    can: () => true,
  }),
}));
jest.mock('../hooks/useSaasConfig', () => ({
  useSaasConfig: () => ({ settlementMode: mockMode, directCardEnabled: false, loading: false }),
}));
jest.mock('../hooks/useCustodyLeftover', () => ({ useCustodyLeftover: () => false }));
jest.mock('../hooks/useAdminCustodyOpen', () => ({ useAdminCustodyOpen: () => false }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() },
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));

beforeEach(() => {
  mockMode = 'direto';
  (api.get as jest.Mock).mockReset();
});

describe('navConfig motoboy', () => {
  const labels = (mode: string) => getNavItems('motoboy', () => true, false, { settlementMode: mode }).map((i) => i.label);
  // D2 (spec 6.1): a aba continua "Ganhos" nos dois modos; "Repasses recebidos" é o conteúdo da tela no direto.
  test('direto e custódia: as mesmas 4 abas, com "Ganhos"', () => {
    expect(labels('direto')).toEqual(['Corridas', 'Ganhos', 'Nível', 'Perfil']);
    expect(labels('custodia')).toEqual(['Corridas', 'Ganhos', 'Nível', 'Perfil']);
  });
});
