import { render, screen, fireEvent } from '@testing-library/react';
import { OrderCard } from '../OrderCard';

const base = {
  id: 'o1',
  code: 'A1B2C3D4',
  storeName: 'Pizza Place',
  status: 'enviado',
  total: 42.5,
  itemsLabel: '2 itens · Pizza, Refri',
  date: '31 de julho de 2026',
};

describe('OrderCard', () => {
  it('mostra loja, resumo, código e total', () => {
    render(<OrderCard order={base} />);
    expect(screen.getByText('Pizza Place')).toBeInTheDocument();
    expect(screen.getByText(/#A1B2C3D4 · 2 itens · Pizza, Refri/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s?42,50/)).toBeInTheDocument();
    expect(screen.getByText('31 de julho de 2026')).toBeInTheDocument();
  });

  it('clicável dispara onClick', () => {
    const onClick = jest.fn();
    render(<OrderCard order={base} onClick={onClick} />);
    fireEvent.click(screen.getByText('Pizza Place'));
    expect(onClick).toHaveBeenCalled();
  });
});
