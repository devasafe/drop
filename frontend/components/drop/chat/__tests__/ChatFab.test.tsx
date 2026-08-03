import { render, screen, fireEvent } from '@testing-library/react';
import { ChatFab } from '../ChatFab';

test('mostra o badge de não-lidas e dispara onOpen', () => {
  const onOpen = jest.fn();
  render(<ChatFab unreadTotal={3} onOpen={onOpen} />);
  expect(screen.getByText('3')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /chat|mensagens|abrir/i }));
  expect(onOpen).toHaveBeenCalled();
});

test('sem não-lidas não mostra badge', () => {
  render(<ChatFab unreadTotal={0} onOpen={() => {}} />);
  expect(screen.queryByText('0')).toBeNull();
});
