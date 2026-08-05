import { render, screen, fireEvent } from '@testing-library/react';
import { Section } from '../Section';
import { List, Row } from '../List';
import { KpiBand, Kpi } from '../KpiBand';

describe('Section', () => {
  test('renderiza título como heading e os filhos', () => {
    render(<Section title="Pedidos"><p>corpo</p></Section>);
    expect(screen.getByRole('heading', { name: 'Pedidos' })).toBeInTheDocument();
    expect(screen.getByText('corpo')).toBeInTheDocument();
  });
  test('sem título/ação não renderiza cabeçalho', () => {
    render(<Section><p>só corpo</p></Section>);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
  test('renderiza a ação à direita', () => {
    render(<Section title="X" action={<button>Novo</button>}><p>c</p></Section>);
    expect(screen.getByRole('button', { name: 'Novo' })).toBeInTheDocument();
  });
});

describe('List / Row', () => {
  test('renderiza as linhas', () => {
    render(<List><Row>A</Row><Row>B</Row></List>);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });
  test('Row interativa com onClick vira botão navegável por teclado', () => {
    const onClick = jest.fn();
    render(<List><Row interactive onClick={onClick}>Abrir</Row></List>);
    const row = screen.getByRole('button', { name: 'Abrir' });
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  test('accent aplica a classe de acento', () => {
    render(<List><Row accent>Novo</Row></List>);
    expect(screen.getByText('Novo')).toHaveClass('accent');
  });
});

describe('KpiBand / Kpi', () => {
  test('renderiza valor e rótulo', () => {
    render(<KpiBand><Kpi label="Pendente" value="R$ 10" tone="warn" /></KpiBand>);
    expect(screen.getByText('R$ 10')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
  });
  test('tone aplica a cor semântica', () => {
    render(<KpiBand><Kpi label="L" value="V" tone="success" /></KpiBand>);
    expect(screen.getByText('V')).toHaveClass('success');
  });
});
