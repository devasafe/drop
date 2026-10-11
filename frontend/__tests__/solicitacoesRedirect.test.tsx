import { render } from '@testing-library/react';
import { ROUTES } from '../lib/routes';

const redirect = jest.fn();
jest.mock('../hooks/useClienteRedirect', () => ({ useClienteRedirect: (to: string | null) => redirect(to) }));
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
import SolicitacoesPage from '../pages/privacidade/solicitacoes';

test('/privacidade/solicitacoes manda só o cliente para /conta/privacidade', () => {
  render(<SolicitacoesPage />);
  expect(redirect).toHaveBeenCalledWith(ROUTES.privacidadeConta);
  expect(ROUTES.privacidadeConta).toBe('/conta/privacidade');
});
