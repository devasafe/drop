import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreateStore from '../pages/seller/create-store';
import api from '../lib/api';

const mockPush = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: { onboarding: '1' }, pathname: '/seller/create-store' }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { activeRole: 'lojista', role: 'lojista' }, loading: false }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia', directCardEnabled: false, loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { post: jest.fn(() => Promise.resolve({ data: { _id: 's1' } })) } }));

beforeAll(() => {
  (window as any).google = {
    maps: {
      Map: jest.fn(() => ({ setCenter: jest.fn() })),
      Marker: jest.fn(() => ({ addListener: jest.fn(), setPosition: jest.fn() })),
      Geocoder: jest.fn(() => ({
        geocode: (_req: any, cb: any) => cb([{ geometry: { location: { lat: () => -23.55, lng: () => -46.66 } } }], 'OK'),
      })),
    },
  };
});
afterAll(() => { delete (window as any).google; });

test('depois de criar a loja, volta para o checklist Abrir a loja', async () => {
  render(<CreateStore />);
  const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  set('Nome da loja', 'Eletro Center');
  set('CNPJ', '12345678000190');
  set('CEP', '01305100');
  set('Rua', 'Rua Augusta');
  set('Número', '1200');
  set('Bairro', 'Consolação');
  set('Cidade', 'São Paulo');
  set('Estado', 'SP');
  fireEvent.blur(screen.getByLabelText('Estado'));
  await waitFor(() => expect((screen.getByLabelText('Latitude') as HTMLInputElement).value).not.toBe(''));
  fireEvent.click(screen.getByText('Cadastrar Loja'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores', expect.objectContaining({ name: 'Eletro Center', street: 'Rua Augusta', number: '1200' })));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/seller/abrir'));
});
