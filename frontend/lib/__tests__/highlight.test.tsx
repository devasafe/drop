import { render } from '@testing-library/react';
import { highlight } from '../highlight';

it('negrito no trecho digitado, sem diferenciar acento e maiúscula', () => {
  const { container } = render(<span>{highlight('Fone Bluetooth JBL', 'fone blu')}</span>);
  expect(container.querySelector('strong')?.textContent).toBe('Fone Blu');
  expect(container.textContent).toBe('Fone Bluetooth JBL');
  const r2 = render(<span>{highlight('Ração Golden', 'racao')}</span>);
  expect(r2.container.querySelector('strong')?.textContent).toBe('Ração');
});
it('sem casamento: texto puro', () => {
  const { container } = render(<span>{highlight('Caderno', 'fone')}</span>);
  expect(container.querySelector('strong')).toBeNull();
});
