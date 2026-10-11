import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductCard, productBadges } from '../ProductCard';
import { StoreCard } from '../StoreCard';
import { cssViolations } from '../../../__tests__/helpers/dsTokens';

const p = { name: 'Fone JBL', price: 229.9, oldPrice: 289.9, discountPercent: 20 };

describe('ProductCard v2', () => {
  it('no máximo 2 badges, na ordem desconto > frete grátis > últimas unidades', () => {
    expect(productBadges({ ...p, freeDelivery: true, stock: 2 })).toEqual(['-20%', 'Frete grátis']);
    expect(productBadges({ name: 'x', price: 10, stock: 2 })).toEqual(['Últimas unidades']);
    expect(productBadges({ name: 'x', price: 10, stock: 10 })).toEqual([]);
  });
  it('esgotado: rótulo e botão desabilitado', () => {
    const onAdd = jest.fn();
    render(<ProductCard variant="busca" product={{ name: 'Fone', price: 10, stock: 0 }} onAdd={onAdd} />);
    expect(screen.getByText('Esgotado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar Fone' })).toBeDisabled();
  });
  it('mostra o prazo, ou "Não entrega aqui"', () => {
    const { rerender } = render(<ProductCard variant="busca" product={{ ...p, etaMinutes: 35 }} onAdd={jest.fn()} />);
    expect(screen.getByText('~35 min')).toBeInTheDocument();
    rerender(<ProductCard variant="busca" product={{ ...p, outOfArea: true }} onAdd={jest.fn()} />);
    expect(screen.getByText('Não entrega aqui')).toBeInTheDocument();
  });
  it('loja só aparece fora da página da loja', () => {
    const { rerender } = render(<ProductCard variant="busca" product={{ ...p, store: 'Eletro Center' }} onAdd={jest.fn()} />);
    expect(screen.getByText('Eletro Center')).toBeInTheDocument();
    rerender(<ProductCard variant="loja" product={{ ...p, store: 'Eletro Center' }} onAdd={jest.fn()} />);
    expect(screen.queryByText('Eletro Center')).toBeNull();
  });
  it('adicionar chama onAdd', () => {
    const onAdd = jest.fn();
    render(<ProductCard variant="home" product={p} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Fone JBL' }));
    expect(onAdd).toHaveBeenCalled();
  });
  it('adicionar não navega nem dispara o clique do card (P6)', () => {
    const onAdd = jest.fn();
    const onCardClick = jest.fn();
    const onLinkClick = jest.fn((e: React.MouseEvent) => e.preventDefault());
    render(
      <div onClick={onCardClick}>
        <a href="/produto/1" onClick={onLinkClick}>
          <ProductCard variant="home" product={p} onAdd={onAdd} />
        </a>
      </div>,
    );
    const btn = screen.getByRole('button', { name: 'Adicionar Fone JBL' });
    const notPrevented = fireEvent.click(btn);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false); // preventDefault: o link não navega
    expect(onCardClick).not.toHaveBeenCalled();
    expect(onLinkClick).not.toHaveBeenCalled();
  });
});

describe('StoreCard v2', () => {
  const s = { name: 'Eletro Center', status: 'aberta' as const, category: 'Pinheiros • São Paulo' };
  it('prazo e frete na mesma linha', () => {
    render(<StoreCard variant="resultado" store={{ ...s, etaMin: [25, 35], fee: 6.2 }} onClick={jest.fn()} />);
    expect(screen.getByText('25–35 min')).toBeInTheDocument();
    expect(screen.getByText('R$ 6,20')).toBeInTheDocument();
  });
  it('frete grátis, fechada e fora da área', () => {
    const { rerender } = render(<StoreCard variant="resultado" store={{ ...s, etaMin: [25, 35], freeDelivery: true }} onClick={jest.fn()} />);
    expect(screen.getByText('25–35 min')).toBeInTheDocument();
    expect(screen.getByText('Frete grátis')).toBeInTheDocument();
    rerender(<StoreCard variant="resultado" store={{ ...s, status: 'fechada', opensAt: '09:00' }} onClick={jest.fn()} />);
    expect(screen.getByText('Loja fechada · abre às 09:00')).toBeInTheDocument();
    rerender(<StoreCard variant="resultado" store={{ ...s, outOfArea: true }} onClick={jest.fn()} />);
    expect(screen.getByText('Não entrega aqui')).toBeInTheDocument();
  });
  it('sem cotação não inventa linha de entrega', () => {
    render(<StoreCard variant="resultado" store={s} onClick={jest.fn()} />);
    expect(screen.queryByText(/min|Frete|entrega/)).toBeNull();
  });
});

it('CSS dos cards só usa tokens semânticos', () => {
  for (const f of ['ProductCard.module.css', 'StoreCard.module.css', 'RepeatRow.module.css']) {
    expect({ f, v: cssViolations(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')) }).toEqual({ f, v: [] });
  }
});

describe('cards: casos de borda (rodada 1)', () => {
  it('esgotado não mostra badges; carrinho nunca mostra badge', () => {
    render(<ProductCard variant="home" product={{ ...p, stock: 0, freeDelivery: true }} onAdd={jest.fn()} />);
    expect(screen.queryByText('-20%')).toBeNull();
    expect(screen.queryByText('Frete grátis')).toBeNull();
    render(<ProductCard variant="carrinho" product={{ ...p, name: 'Cabo', freeDelivery: true, stock: 2 }} onAdd={jest.fn()} />);
    expect(screen.queryByText('Últimas unidades')).toBeNull();
    expect(screen.getAllByText('Esgotado')).toHaveLength(1);
  });
  it('stockLabel legado conta como "Últimas unidades"', () => {
    render(<ProductCard variant="busca" product={{ name: 'x', price: 10 }} stockLabel="Restam 2" onAdd={jest.fn()} />);
    expect(screen.getByText('Últimas unidades')).toBeInTheDocument();
  });
  it('loja fechada não promete prazo nem frete, com ou sem opensAt', () => {
    const s = { name: 'L', status: 'fechada' as const, category: 'c', etaMin: [25, 35] as [number, number], freeDelivery: true };
    const { rerender } = render(<StoreCard variant="resultado" store={s} onClick={jest.fn()} />);
    expect(screen.getByText('Loja fechada')).toBeInTheDocument();
    expect(screen.queryByText(/min/)).toBeNull();
    rerender(<StoreCard variant="resultado" store={{ ...s, opensAt: '09:00' }} onClick={jest.fn()} />);
    expect(screen.getByText('Loja fechada · abre às 09:00')).toBeInTheDocument();
  });
});
