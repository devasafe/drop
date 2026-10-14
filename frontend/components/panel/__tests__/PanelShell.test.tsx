import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import { cssViolations } from '../../../__tests__/helpers/dsTokens';

const mockPush = jest.fn();
let mockPath = '/aba';
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, pathname: mockPath, asPath: mockPath }) }));
import PanelShell from '../PanelShell';

const soAba = (p: string) => p === '/aba';
beforeEach(() => { mockPush.mockClear(); mockPath = '/aba'; });

test('aba: título como heading, sem voltar, e o espaço da barra reservado', () => {
  const { container } = render(<PanelShell title="Ganhos" showsTabBar={soAba}><p>conteúdo</p></PanelShell>);
  expect(screen.getByRole('heading', { level: 1, name: 'Ganhos' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull();
  expect(container.querySelector('[data-shell-top="aba"]')).not.toBeNull();
  expect((container.firstElementChild as HTMLElement).className).not.toContain('noBar');
});

test('secundária: header branco, voltar leva à rota dada, sem o espaço da barra', () => {
  mockPath = '/fluxo';
  const { container } = render(
    <PanelShell title="Ranking" back="/motoboy/nivel" showsTabBar={soAba} actions={<button type="button">Ajuda</button>}>
      <p>x</p>
    </PanelShell>,
  );
  expect(container.querySelector('[data-shell-top="secundaria"]')!.className).toContain('topWhite');
  expect((container.firstElementChild as HTMLElement).className).toContain('noBar');
  fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
  expect(mockPush).toHaveBeenCalledWith('/motoboy/nivel');
  expect(screen.getByRole('button', { name: 'Ajuda' })).toBeInTheDocument();
});

test('bare: sem topo (telas de conclusão), o conteúdo segue nomeado pelo título', () => {
  mockPath = '/fluxo';
  const { container } = render(<PanelShell title="Entrega concluída" bare showsTabBar={soAba}><p>corpo</p></PanelShell>);
  expect(container.querySelector('[data-shell-top]')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Entrega concluída' })).toBeNull();
  expect(screen.getByRole('region', { name: 'Entrega concluída' })).toBeInTheDocument();
  expect(screen.getByText('corpo')).toBeInTheDocument();
});

test('exceção no corpo: erro com "Tentar de novo" e o topo continua (nunca tela branca)', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const Quebra = () => { throw new Error('boom'); };
  render(<PanelShell title="Perfil" showsTabBar={soAba}><Quebra /></PanelShell>);
  expect(screen.getByRole('heading', { level: 1, name: 'Perfil' })).toBeInTheDocument();
  expect(screen.getByText('Não deu para abrir esta tela')).toBeInTheDocument();
  spy.mockRestore();
});

test('o código da casca não depende de provider de painel nem de toast', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'PanelShell.tsx'), 'utf8');
  expect(src).not.toMatch(/SellerPanelProvider|useSellerPanel|useToast|ToastProvider/);
});

test('CSS da casca e dos blocos só com tokens do DS v2', () => {
  for (const f of ['PanelShell.module.css', 'PanelBlocks.module.css']) {
    expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'))).toEqual([]);
  }
});

test('NavRow: o caminho antigo da loja reexporta o mesmo componente', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  expect(require('../../seller/ui/NavRow').NavRow).toBe(require('../NavRow').NavRow);
});
