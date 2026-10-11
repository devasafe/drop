import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import { StickyCart } from '../StickyCart';
import { cssViolations } from '../../../__tests__/helpers/dsTokens';

test('"Ver sacola · N itens" com o total, e abre a sacola', () => {
  const onOpen = jest.fn();
  render(<StickyCart count={3} total={241.4} onOpen={onOpen} />);
  const btn = screen.getByRole('button', { name: 'Ver sacola, 3 itens, total R$ 241,40' });
  expect(btn).toHaveTextContent('Ver sacola · 3 itens');
  expect(btn).toHaveTextContent('R$ 241,40');
  fireEvent.click(btn);
  expect(onOpen).toHaveBeenCalled();
});
test('1 item no singular', () => {
  render(<StickyCart count={1} total={39.9} onOpen={jest.fn()} />);
  expect(screen.getByRole('button')).toHaveTextContent('Ver sacola · 1 item');
});
test('CSS em tokens semânticos', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'StickyCart.module.css'), 'utf8'))).toEqual([]);
});
