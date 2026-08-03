import { render, screen } from '@testing-library/react';
import { MessageBubble } from '../MessageBubble';

const msg = { senderId: 'u1', text: 'Olá mundo', createdAt: '2026-08-03T14:30:00' };

test('mostra o texto e o horário', () => {
  render(<MessageBubble message={msg} isOwn={false} />);
  expect(screen.getByText('Olá mundo')).toBeInTheDocument();
  expect(screen.getByText(/14:30/)).toBeInTheDocument();
});

test('bolha própria e do outro têm classes distintas', () => {
  const { container: own } = render(<MessageBubble message={msg} isOwn={true} />);
  const { container: other } = render(<MessageBubble message={msg} isOwn={false} />);
  expect(own.firstChild).not.toEqual(other.firstChild);
  expect(own.querySelector('[class*="own"]')).toBeTruthy();
});
