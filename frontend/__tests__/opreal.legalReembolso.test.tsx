/**
 * Termos e Privacidade 2.1 (26/10/2026): o texto acompanha o que o app faz. Reembolso de pedido
 * entregue (caso B), motoboy que desiste com o pacote (caso A), loja só com CNPJ, localização do
 * motoboy durante a corrida e fotos do pedido de reembolso.
 */
import { render } from '@testing-library/react';
import TermosPage from '../pages/termos';
import PrivacidadePage from '../pages/privacidade';
import { LEGAL_VERSIONS, LEGAL_UPDATED } from '../lib/legalDocs';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), query: {}, pathname: '/termos' }) }));

const textOf = (Page: () => JSX.Element) => render(<Page />).container.textContent || '';

test('versão 2.1 de 26/10/2026', () => {
  expect(LEGAL_VERSIONS.terms).toBe('2.1');
  expect(LEGAL_VERSIONS.privacy).toBe('2.1');
  expect(LEGAL_UPDATED).toBe('26/10/2026');
});

test('termos: reembolso de pedido entregue como o app faz', () => {
  const t = textOf(TermosPage);
  expect(t).toMatch(/Reembolso de pedido entregue/);
  expect(t).toMatch(/a loja aprova ou recusa/i);
  expect(t).toMatch(/levando na loja, sem custo/);
  expect(t).toMatch(/No arrependimento, o cliente paga a corrida por Pix antes de o motoboy sair/);
  expect(t).toMatch(/quando a loja confirma que recebeu o produto/);
  expect(t).toMatch(/7 dias corridos/);
});

test('termos: motoboy que não conclui depois de retirar e loja com CNPJ', () => {
  const t = textOf(TermosPage);
  expect(t).toMatch(/nova entrega ou o reembolso total/);
  expect(t).toMatch(/empresa com CNPJ/);
});

test('privacidade: localização do motoboy e fotos do reembolso', () => {
  const p = textOf(PrivacidadePage);
  expect(p).toMatch(/localização do aparelho do motoboy durante as corridas/);
  expect(p).toMatch(/pedidos de reembolso \(motivo, comentário e fotos\)/);
  expect(p).toMatch(/para lojistas, CNPJ e comprovante de endereço/);
});
