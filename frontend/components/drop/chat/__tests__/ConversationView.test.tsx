import { render, screen } from '@testing-library/react';
import { ConversationView } from '../ConversationView';

const messages = [
  { senderId: 'me', text: 'oi', createdAt: '2026-08-03T10:00:00' },
  { senderId: 'other', text: 'olá', createdAt: '2026-08-03T10:01:00' },
];

test('renderiza as mensagens', () => {
  render(<ConversationView messages={messages} loading={false} currentUserId="me" />);
  expect(screen.getByText('oi')).toBeInTheDocument();
  expect(screen.getByText('olá')).toBeInTheDocument();
});

test('mostra o indicador de digitação quando typingName', () => {
  render(<ConversationView messages={[]} loading={false} currentUserId="me" typingName="Loja" />);
  expect(screen.getByText(/digitando/i)).toBeInTheDocument();
});

test('estado vazio sem mensagens', () => {
  render(<ConversationView messages={[]} loading={false} currentUserId="me" />);
  expect(screen.queryByText('oi')).toBeNull();
});
