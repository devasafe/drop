import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { EmptyState } from '../EmptyState';
import { Badge } from '../Badge';
import { cssViolations } from '../../../__tests__/helpers/dsTokens';

const files = ['Chip', 'Badge', 'StatusPill', 'Tag', 'PriceTag', 'Card', 'List', 'Section', 'KpiBand', 'Skeleton', 'EmptyState']
  .map((n) => path.join(__dirname, '..', `${n}.module.css`))
  .filter((f) => fs.existsSync(f));

it('EmptyState de erro tem "Tentar de novo"', () => {
  const onRetry = jest.fn();
  render(<EmptyState variant="error" icon={null} title="Não carregou" onRetry={onRetry} />);
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(onRetry).toHaveBeenCalled();
});
it('EmptyState padrão não mostra "Tentar de novo"', () => {
  render(<EmptyState icon={null} title="Vazio" onRetry={jest.fn()} />);
  expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
});
it('Badge seal renderiza como discount', () => {
  render(<Badge tone={'seal' as any}>-20%</Badge>);
  expect(screen.getByText('-20%').className).toMatch(/discount/);
});
it('Badge aceita tone status', () => {
  render(<Badge tone="status">Novo</Badge>);
  expect(screen.getByText('Novo').className).toMatch(/status/);
});
it('Skeleton desliga o shimmer em prefers-reduced-motion', () => {
  const c = fs.readFileSync(path.join(__dirname, '..', 'Skeleton.module.css'), 'utf8');
  expect(c).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*animation:\s*none/);
});
it('CSS de exibição só usa tokens semânticos, sem gradiente', () => {
  expect(files.length).toBe(11);
  for (const f of files) {
    const c = fs.readFileSync(f, 'utf8');
    expect({ f, v: cssViolations(c) }).toEqual({ f, v: [] });
  }
});
