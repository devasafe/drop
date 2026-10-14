import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

const mockPush = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush }) }));
import SellerShell from '../SellerShell';

beforeEach(() => mockPush.mockClear());

test('aba: título como heading e sem voltar', () => {
  const { container } = render(<SellerShell title="Pedidos"><p>conteúdo</p></SellerShell>);
  expect(screen.getByRole('heading', { level: 1, name: 'Pedidos' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull();
  expect(container.querySelector('[data-shell-top="aba"]')).not.toBeNull();
  expect(screen.getByText('conteúdo')).toBeInTheDocument();
});

test('secundária: header branco, voltar leva à rota dada e ação à direita', () => {
  const { container } = render(
    <SellerShell title="Desempenho" back="/seller/loja" actions={<button type="button">Ajuda</button>}>
      <p>x</p>
    </SellerShell>,
  );
  const top = container.querySelector('[data-shell-top="secundaria"]');
  expect(top).not.toBeNull();
  expect(top!.className).toContain('topWhite');
  fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
  expect(mockPush).toHaveBeenCalledWith('/seller/loja');
  expect(screen.getByRole('button', { name: 'Ajuda' })).toBeInTheDocument();
});

// D7: telas legadas montam o Shell em testes intocáveis, sem providers e sem aviso de verificação.
test('D7: renderiza sem SellerPanelProvider nem provider de toast, e sem link/texto "verifica"', () => {
  const { container } = render(
    <SellerShell title="Plano" back="/seller/loja"><p>corpo</p></SellerShell>,
  );
  expect(container.textContent).not.toMatch(/verifica/i);
  expect(container.querySelector('a[href*="verifica"]')).toBeNull();
  expect(screen.getByText('corpo')).toBeInTheDocument();
});

test('D7: o código do Shell não depende de provider nem cita verificação', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'SellerShell.tsx'), 'utf8');
  expect(src).not.toMatch(/SellerPanelProvider|useSellerPanel|useToast|ToastProvider/);
  expect(src).not.toMatch(/verifica/i);
});

test('CSS só com tokens do DS v2 (sem cor fixa, token antigo ou gradiente)', () => {
  // O CSS da casca mudou de pasta na D2 (components/panel/PanelShell.module.css); as regras são as mesmas.
  const css = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'panel', 'PanelShell.module.css'), 'utf8');
  expect(cssViolations(css)).toEqual([]);
});

test('aba com lead: o avatar vem antes do título', () => {
  render(<SellerShell title="Eletro Center" lead={<span data-testid="av">EC</span>}><p>x</p></SellerShell>);
  const h = screen.getByRole('heading', { level: 1, name: 'Eletro Center' });
  expect(screen.getByTestId('av').compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
