import { render, screen, fireEvent } from '@testing-library/react';
import { OrderTracker } from '../OrderTracker';

const base = { orderId: 'ABC123', storeName: 'Loja', progress: 0.5, steps: [{ label: 'Confirmado', done: true }] };

test('com onClick vira botão e aciona no clique e no Enter', () => {
  const onClick = jest.fn();
  render(<OrderTracker {...base} onClick={onClick} />);
  const el = screen.getByRole('button');
  fireEvent.click(el);
  fireEvent.keyDown(el, { key: 'Enter' });
  expect(onClick).toHaveBeenCalledTimes(2);
});

test('sem onClick não é botão', () => {
  render(<OrderTracker {...base} />);
  expect(screen.queryByRole('button')).toBeNull();
});
