import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import { ProductCard } from '../ProductCard';

const css = fs.readFileSync(path.join(__dirname, '../ProductCard.module.css'), 'utf8');
const rule = (sel: string) => {
  const start = css.indexOf(`\n${sel} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
};

const oferta = { name: 'Carregador turbo tipo C 65W', price: 1229.9, oldPrice: 1589.9, discountPercent: 23, etaMinutes: 30 };

describe('ProductCard loja em oferta', () => {
  it('renderiza nome, preço, preço antigo, selo e entrega', () => {
    render(<ProductCard variant="loja" product={oferta} onAdd={jest.fn()} />);
    expect(screen.getByText('Carregador turbo tipo C 65W')).toBeInTheDocument();
    expect(screen.getByText('-23%')).toBeInTheDocument();
    expect(screen.getByText('~30 min')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar Carregador turbo tipo C 65W' })).toBeInTheDocument();
  });
  it('o preço fica na coluna do texto, abaixo do nome, e o botão fora dela', () => {
    render(<ProductCard variant="loja" product={oferta} onAdd={jest.fn()} />);
    const name = screen.getByText('Carregador turbo tipo C 65W');
    const block = name.parentElement as HTMLElement;
    expect(block).toContainElement(screen.getByText('-23%'));
    expect(block).not.toContainElement(screen.getByRole('button', { name: /Adicionar/ }));
  });
  it('CSS: nome com line-clamp 2 e quebra; linha de preço pode quebrar; coluna sem min-width', () => {
    expect(rule('.loja .name')).toMatch(/-webkit-line-clamp:\s*2/);
    expect(rule('.loja .name')).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule('.loja .textBlock')).toMatch(/min-width:\s*0/);
    expect(rule('.loja .priceLine')).toMatch(/flex-wrap:\s*wrap/);
  });
});
