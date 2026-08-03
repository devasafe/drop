import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationList } from '../ConversationList';

const convs = [{ _id: 'c1', otherParticipantName: 'Ana', otherParticipantRole: 'cliente', unreadCount: 1, isActive: true, otherParticipantId: 'a', lastMessage: { text: 'oi', senderName: 'Ana', createdAt: '2026-08-03T10:00:00' } }] as any;

test('lista conversas, seleciona e abre nova', () => {
  const onSelect = jest.fn(); const onNew = jest.fn();
  render(<ConversationList conversations={convs} loading={false} onSelect={onSelect} onNew={onNew} />);
  fireEvent.click(screen.getByText('Ana'));
  expect(onSelect).toHaveBeenCalledWith(convs[0]);
  fireEvent.click(screen.getByRole('button', { name: /nova conversa/i }));
  expect(onNew).toHaveBeenCalled();
});

test('vazio mostra estado vazio', () => {
  render(<ConversationList conversations={[]} loading={false} onSelect={() => {}} onNew={() => {}} />);
  expect(screen.getByRole('button', { name: /nova conversa/i })).toBeInTheDocument();
});
