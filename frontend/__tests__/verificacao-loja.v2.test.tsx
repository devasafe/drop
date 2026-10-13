import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VerificacaoLojaPage from '../pages/verificacao-loja';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: { onboarding: '1' }, pathname: '/verificacao-loja' }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { activeRole: 'lojista', role: 'lojista' }, loading: false }) }));
jest.mock('../components/ModeGate', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia', directCardEnabled: false, loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(() => Promise.resolve({ data: { status: 'pending' } })) } }));

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/stores/dashboard') return Promise.resolve({ data: { store: { _id: 's1', cnpj: '12345678000190' } } });
    if (url === '/verification/store/s1') return Promise.resolve({ data: {
      isVerified: false, missing: [],
      facial: { status: 'rejected', rejectionReason: 'Rosto cortado' },
      cnpj: { status: 'pending' }, address: { status: 'approved' },
    } });
    return Promise.resolve({ data: {} });
  });
});

test('mostra o motivo da recusa antes da câmera e abre a câmera frontal', async () => {
  render(<VerificacaoLojaPage />);
  expect(await screen.findByText('Recusado: Rosto cortado')).toBeInTheDocument();
  expect(screen.getByText('Lugar bem iluminado')).toBeInTheDocument();
  const input = screen.getByLabelText('Tirar ou escolher a foto do rosto');
  expect(input).toHaveAttribute('capture', 'user');
  expect(screen.getByText('Usamos a foto só para confirmar que você é o dono do CNPJ.')).toBeInTheDocument();
});

test('enviar a foto chama POST /verification/facial com o campo selfie', async () => {
  render(<VerificacaoLojaPage />);
  const input = await screen.findByLabelText('Tirar ou escolher a foto do rosto');
  const file = new File(['x'], 'rosto.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(screen.getByText('Enviar foto'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/verification/facial', expect.any(FormData), expect.anything()));
  const fd = (api.post as jest.Mock).mock.calls[0][1] as FormData;
  expect(fd.get('selfie')).toBe(file);
});

test('o link de saída volta para o checklist', async () => {
  render(<VerificacaoLojaPage />);
  const link = await screen.findByText('Voltar para Abrir a loja');
  expect(link.closest('a')).toHaveAttribute('href', '/seller/abrir');
});
