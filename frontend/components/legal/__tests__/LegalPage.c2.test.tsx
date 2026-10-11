import { render, screen } from '@testing-library/react';
import LegalPage, { LegalSection } from '../LegalPage';

jest.mock('next/router', () => ({ useRouter: () => ({ back: jest.fn() }) }));

it('resumo, versão e seções em acordeão com âncora', () => {
  render(
    <LegalPage title="Termos de Uso" version="1.0" updatedAt="04/08/2026" summary={['A loja vende e responde pelo produto.']}>
      <LegalSection id="cancelamento" title="3. Cancelamento e estorno"><p>Texto</p></LegalSection>
    </LegalPage>,
  );
  expect(screen.getByText('O essencial')).toBeInTheDocument();
  expect(screen.getByText('A loja vende e responde pelo produto.')).toBeInTheDocument();
  expect(screen.getByText('Versão 1.0 · em vigor desde 04/08/2026')).toBeInTheDocument();
  const sec = screen.getByText('3. Cancelamento e estorno').closest('details');
  expect(sec).toHaveAttribute('id', 'cancelamento');
});

it('a âncora da URL abre a seção dela', () => {
  window.location.hash = '#cancelamento';
  render(
    <LegalPage title="Termos de Uso" version="1.0" updatedAt="04/08/2026">
      <LegalSection id="cancelamento" title="3. Cancelamento"><p>Texto</p></LegalSection>
      <LegalSection id="foro" title="12. Foro"><p>Outro</p></LegalSection>
    </LegalPage>,
  );
  expect(screen.getByText('3. Cancelamento').closest('details')).toHaveAttribute('open');
  expect(screen.getByText('12. Foro').closest('details')).not.toHaveAttribute('open');
  window.location.hash = '';
});
