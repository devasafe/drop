import { fireEvent, render, screen, within } from '@testing-library/react';
import { AdminTable, type AdminColumn } from '../AdminTable';
import { setViewportWidth, resetViewport } from '../../../__tests__/helpers/viewport';

interface Repasse { id: string; nome: string; tipo: string; valor: string }
const ROWS: Repasse[] = [
  { id: 'p1', nome: 'Eletro Center', tipo: 'Loja', valor: 'R$ 206,91' },
  { id: 'p2', nome: 'Carlos Lima', tipo: 'Motoboy', valor: 'R$ 9,92' },
];
const COLUMNS: AdminColumn<Repasse>[] = [
  { key: 'nome', header: 'Recebedor', render: (r) => r.nome, primary: true },
  { key: 'tipo', header: 'Tipo', render: (r) => r.tipo },
  { key: 'valor', header: 'Valor', render: (r) => r.valor, align: 'right' },
];
const base = { columns: COLUMNS, rowKey: (r: Repasse) => r.id, rowLabel: (r: Repasse) => r.nome };

afterEach(() => resetViewport());

describe('AdminTable · computador (≥ 1024 px)', () => {
  beforeEach(() => setViewportWidth(1280));

  it('tabela com cabeçalho, linhas e valor à direita', () => {
    render(<AdminTable {...base} rows={ROWS} />);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Recebedor', 'Tipo', 'Valor']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('R$ 206,91').className).toContain('right');
    expect(within(table).getByRole('columnheader', { name: 'Valor' }).className).toContain('right');
  });

  it('seleção: uma linha, todas, e desmarcar todas', () => {
    const onSel = jest.fn();
    const { rerender } = render(<AdminTable {...base} rows={ROWS} selectable selected={new Set()} onSelectedChange={onSel} />);
    fireEvent.click(screen.getByLabelText('Selecionar Carlos Lima'));
    expect(Array.from(onSel.mock.calls[0][0] as Set<string>)).toEqual(['p2']);
    fireEvent.click(screen.getByLabelText('Selecionar todos'));
    expect(Array.from(onSel.mock.calls[1][0] as Set<string>).sort()).toEqual(['p1', 'p2']);
    rerender(<AdminTable {...base} rows={ROWS} selectable selected={new Set(['p1', 'p2'])} onSelectedChange={onSel} />);
    expect(screen.getByLabelText('Selecionar todos')).toBeChecked();
    expect(screen.getByLabelText('Selecionar Eletro Center')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Selecionar todos'));
    expect(Array.from(onSel.mock.calls[2][0] as Set<string>)).toEqual([]);
  });

  it('ação por linha e clique no título da linha', () => {
    const onRowClick = jest.fn();
    render(<AdminTable {...base} rows={ROWS} onRowClick={onRowClick} rowAction={(r) => <button type="button">Liberar {r.nome}</button>} />);
    expect(screen.getByRole('button', { name: 'Liberar Carlos Lima' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Eletro Center' }));
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);
  });
});

describe('AdminTable · celular (< 1024 px)', () => {
  beforeEach(() => setViewportWidth(360));

  it('vira lista de cartões: título, campos com rótulo e a ação', () => {
    render(<AdminTable {...base} rows={ROWS} rowAction={(r) => <button type="button">Liberar {r.nome}</button>} caption="Repasses" />);
    expect(screen.queryByRole('table')).toBeNull();
    const cards = within(screen.getByRole('list', { name: 'Repasses' })).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('Eletro Center')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Tipo')).toBeInTheDocument();
    expect(within(cards[0]).getByText('R$ 206,91')).toBeInTheDocument();
    expect(within(cards[0]).getByRole('button', { name: 'Liberar Eletro Center' })).toBeInTheDocument();
  });

  it('seleção no cartão com toque de 44 px e "Selecionar todos"', () => {
    const onSel = jest.fn();
    render(<AdminTable {...base} rows={ROWS} selectable selected={new Set()} onSelectedChange={onSel} />);
    const box = screen.getByLabelText('Selecionar Eletro Center');
    expect(box.closest('label')!.className).toContain('checkHit');
    fireEvent.click(box);
    expect(Array.from(onSel.mock.calls[0][0] as Set<string>)).toEqual(['p1']);
    fireEvent.click(screen.getByLabelText('Selecionar todos'));
    expect(Array.from(onSel.mock.calls[1][0] as Set<string>).sort()).toEqual(['p1', 'p2']);
  });
});

describe('AdminTable · estados (fail closed)', () => {
  it('carregando (ou rows null): esqueleto, sem tabela e sem "vazio"', () => {
    const { rerender } = render(<AdminTable {...base} rows={null} empty="Nenhum repasse aguardando" />);
    expect(screen.getByLabelText('Carregando')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Nenhum repasse aguardando')).toBeNull();
    rerender(<AdminTable {...base} rows={ROWS} loading />);
    expect(screen.getByLabelText('Carregando')).toBeInTheDocument();
  });

  it('erro vence as linhas: mostra o erro com "Tentar de novo", nunca as linhas velhas nem o vazio', () => {
    const onRetry = jest.fn();
    render(<AdminTable {...base} rows={ROWS} error="Não deu para carregar os repasses." onRetry={onRetry} empty="Nenhum repasse aguardando" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não deu para carregar os repasses.');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Eletro Center')).toBeNull();
    expect(screen.queryByText('Nenhum repasse aguardando')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('erro também vence o carregando', () => {
    render(<AdminTable {...base} rows={null} loading error="Falhou" onRetry={() => undefined} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou');
    expect(screen.queryByLabelText('Carregando')).toBeNull();
  });

  it('vazio: o texto da tela', () => {
    render(<AdminTable {...base} rows={[]} empty="Nenhum repasse aguardando" />);
    expect(screen.getByText('Nenhum repasse aguardando')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
