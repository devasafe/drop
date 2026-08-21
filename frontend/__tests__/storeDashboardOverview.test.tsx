import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// ProtectedRoute exige auth — bypassa renderizando os filhos direto.
jest.mock('../components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Banner de onboarding faz suas próprias chamadas de API — irrelevante para este teste.
jest.mock('../components/OnboardingResumeBanner', () => ({
  __esModule: true,
  default: () => null,
}));

// Componentes das abas metrics/chat (não montados por padrão, mas mocka por segurança).
jest.mock('../components/StoreBannerUpload', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/OperatingHoursEditor', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/ChatConversationList', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/ChatConversationDetail', () => ({ __esModule: true, default: () => null }));

// Socket real faria conexão de rede; stub simples sem-op.
jest.mock('../lib/socket', () => ({
  connectSocket: () => ({ connected: false, connect: jest.fn(), on: jest.fn(), off: jest.fn(), emit: jest.fn() }),
  getSocket: () => null,
}));
jest.mock('../hooks/useAutoRefetch', () => ({
  useAutoRefetch: jest.fn(),
  useSocketListener: jest.fn(),
  useSocketToast: jest.fn(),
}));

const dashboardData = {
  store: { _id: 'store1', name: 'Loja Teste', isOpen: true, plan: 1 },
  orders: [],
  history: [],
  categories: [],
};

jest.mock('../lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn((url: string) => {
      if (url === '/stores/dashboard') return Promise.resolve({ data: dashboardData });
      return Promise.resolve({ data: {} });
    }),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    put: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

let mockQuery: Record<string, string> = {};
jest.mock('next/router', () => ({
  // isReady:true — o effect de deep-link (?tab=) espera a query hidratar
  // (if (!router.isReady) return). Sem isso, a aba nunca é lida da URL.
  useRouter: () => ({ query: mockQuery, push: jest.fn(), isReady: true }),
}));

import AuthContext from '../contexts/AuthContext';
import StoreDashboard from '../pages/store-dashboard';

function renderDashboard() {
  return render(
    <AuthContext.Provider value={{ user: { _id: 'u1', activeRole: 'lojista' }, token: 'tok' } as any}>
      <StoreDashboard />
    </AuthContext.Provider>
  );
}

describe('StoreDashboard — aba default é Visão geral', () => {
  beforeEach(() => {
    mockQuery = {};
  });

  test('sem ?tab= na querystring, renderiza a Visão geral (OverviewTab)', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Faturamento hoje')).toBeInTheDocument());
  });

  test('com ?tab=orders, ainda mostra a aba Pedidos', async () => {
    mockQuery = { tab: 'orders' };
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Pedidos em Andamento')).toBeInTheDocument());
  });
});
