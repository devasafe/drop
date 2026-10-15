import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
import { BatchBar } from '../BatchBar';

describe('BatchBar', () => {
  it('sem seleção: não aparece', () => {
    const { container } = render(<BatchBar count={0} actionLabel="Liberar" onAction={jest.fn()} onClear={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra "N selecionados · resumo", a ação e o Limpar', () => {
    const onAction = jest.fn();
    const onClear = jest.fn();
    render(<BatchBar count={12} summary="R$ 1.284,30" actionLabel="Liberar 12 repasses" onAction={onAction} onClear={onClear} />);
    const bar = screen.getByRole('region', { name: 'Itens selecionados' });
    expect(bar).toHaveTextContent('12 selecionados · R$ 1.284,30');
    fireEvent.click(screen.getByRole('button', { name: 'Liberar 12 repasses' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('singular com 1 item', () => {
    render(<BatchBar count={1} actionLabel="Aprovar" onAction={jest.fn()} onClear={jest.fn()} />);
    expect(screen.getByRole('region', { name: 'Itens selecionados' })).toHaveTextContent('1 selecionado');
  });

  it('enviando: os dois botões travam e a ação mostra "Enviando…"', () => {
    const onAction = jest.fn();
    render(<BatchBar count={3} actionLabel="Aprovar e pagar 3" onAction={onAction} busy onClear={jest.fn()} />);
    const btn = screen.getByRole('button', { name: 'Enviando…' });
    expect(btn).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Limpar' })).toBeDisabled();
    fireEvent.click(btn);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('botões com toque de 44 px e barra fixa no rodapé (CSS)', () => {
    render(<BatchBar count={2} actionLabel="Liberar" onAction={jest.fn()} onClear={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Liberar' }).className).toContain('touch');
    const css = fs.readFileSync(path.join(__dirname, '..', 'BatchBar.module.css'), 'utf8');
    expect(css).toMatch(/\.touch\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.bar\s*\{[^}]*position:\s*fixed/);
  });
});
