import { render, screen, fireEvent } from '@testing-library/react';
import { ChatTabBar } from '../ChatTabBar';

const tabs = [
  { _id: 't1', otherParticipantName: 'Ana', otherParticipantRole: 'cliente', unreadCount: 0, isActive: true, otherParticipantId: 'a', messages: [], isLoading: false },
  { _id: 't2', otherParticipantName: 'Loja X', otherParticipantRole: 'lojista', unreadCount: 2, isActive: true, otherParticipantId: 'b', messages: [], isLoading: false },
] as any;

test('lista as abas, seleciona e fecha', () => {
  const onSelect = jest.fn(); const onClose = jest.fn();
  render(<ChatTabBar tabs={tabs} activeTabId="t1" onSelect={onSelect} onClose={onClose} />);
  fireEvent.click(screen.getByText('Loja X'));
  expect(onSelect).toHaveBeenCalledWith('t2');
  fireEvent.click(screen.getAllByRole('button', { name: /fechar aba/i })[0]);
  expect(onClose).toHaveBeenCalled();
});
