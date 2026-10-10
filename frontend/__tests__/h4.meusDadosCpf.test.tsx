import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MeusDadosForm from '../components/MeusDadosForm';
import api from '../lib/api';

// H4 — "Meus dados" confere o dígito verificador do CPF antes de chamar PATCH /user/me
// e mostra o erro no próprio campo.

jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { activeRole: 'cliente' } }) }));
jest.mock('../components/StoreSettingsEditor', () => ({ __esModule: true, default: () => null }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(() => Promise.resolve({ data: { name: 'Fulano', email: 'f@x.com', cpf: '', rg: '' } })),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

beforeEach(() => { (api.patch as jest.Mock).mockClear(); });

async function preencherCpf(valor: string) {
  render(<MeusDadosForm />);
  const campo = await screen.findByPlaceholderText('000.000.000-00');
  fireEvent.change(campo, { target: { value: valor } });
  fireEvent.click(screen.getByText('Salvar alterações'));
  return campo;
}

describe('MeusDadosForm — CPF', () => {
  it('CPF inválido: não chama a API e mostra o erro no campo', async () => {
    const campo = await preencherCpf('123.456.789-00');
    expect(await screen.findByText('CPF inválido')).toBeInTheDocument();
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('CPF válido: envia só os dígitos', async () => {
    await preencherCpf('390.533.447-05');
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    expect((api.patch as jest.Mock).mock.calls[0][1].cpf).toBe('39053344705');
  });
});
