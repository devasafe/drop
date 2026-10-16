import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
import { StatusTag } from '../../StatusTag';
import { EmptyNote, LoadError, LoadSkeleton } from '../../LoadState';

describe('peças da P3', () => {
  it('StatusTag: texto e tom', () => {
    render(<StatusTag tone="bad">Bloqueado</StatusTag>);
    const tag = screen.getByText('Bloqueado');
    expect(tag.className).toContain('tag');
    expect(tag.className).toContain('bad');
  });

  it('LoadError: alerta com a mensagem e "Tentar de novo"', () => {
    const onRetry = jest.fn();
    render(<LoadError message="Não deu para carregar os usuários." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não deu para carregar os usuários.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('LoadSkeleton: ocupado, sem texto de vazio', () => {
    render(<LoadSkeleton />);
    expect(screen.getByLabelText('Carregando')).toHaveAttribute('aria-busy', 'true');
  });

  it('EmptyNote: o texto da tela', () => {
    render(<EmptyNote text="Nada pendente" />);
    expect(screen.getByText('Nada pendente')).toBeInTheDocument();
  });

  it('PessoasForm.module.css: toque de 44 px abaixo de 1024 px', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'PessoasForm.module.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width: 1023px\)\s*\{\s*\.touch\s*\{\s*min-height:\s*44px/);
  });
});
