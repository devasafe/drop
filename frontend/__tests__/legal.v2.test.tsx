/** Termos e Privacidade 2.0: DROP operada por pessoa física, sem razão social, CNPJ ou sede. */
import { render } from '@testing-library/react';
import TermosPage from '../pages/termos';
import PrivacidadePage from '../pages/privacidade';
import { LEGAL_OPERATOR_NAME, PRIVACY_EMAIL } from '../lib/legalDocs';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), query: {}, pathname: '/termos' }) }));

test.each([['Termos', TermosPage], ['Privacidade', PrivacidadePage]])('%s: sem dados de empresa e com o responsável', (_n, Page) => {
  const { container } = render(<Page />);
  const text = container.textContent || '';
  expect(text).not.toMatch(/RAZÃO SOCIAL|CNPJ sob|ENDEREÇO DA EMPRESA|NOME DO ENCARREGADO/);
  expect(text).toContain(LEGAL_OPERATOR_NAME);
  expect(text).toContain(PRIVACY_EMAIL);
});

test('nome do responsável preenchido (não é o marcador)', () => {
  expect(LEGAL_OPERATOR_NAME).not.toMatch(/^\[/);
});
