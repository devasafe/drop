import { render, screen, fireEvent } from '@testing-library/react';
import { NewConversationPanel } from '../NewConversationPanel';

test('busca, escolhe contato e volta', () => {
  const onSearch = jest.fn(); const onPick = jest.fn(); const onBack = jest.fn();
  render(<NewConversationPanel contacts={[{ _id: 'x', name: 'Ana' }]} stores={[]} search="" onSearch={onSearch} loading={false} onPick={onPick} onBack={onBack} />);
  fireEvent.change(screen.getByPlaceholderText(/buscar/i), { target: { value: 'an' } });
  expect(onSearch).toHaveBeenCalledWith('an');
  fireEvent.click(screen.getByText('Ana'));
  expect(onPick).toHaveBeenCalledWith({ _id: 'x', name: 'Ana' });
  fireEvent.click(screen.getByRole('button', { name: /conversas/i }));
  expect(onBack).toHaveBeenCalled();
});

test('escolhe loja', () => {
  const onPick = jest.fn();
  render(<NewConversationPanel contacts={[]} stores={[{ _id: 's1', name: 'Loja X' }]} search="" onSearch={() => {}} loading={false} onPick={onPick} onBack={() => {}} />);
  fireEvent.click(screen.getByText('Loja X'));
  expect(onPick).toHaveBeenCalledWith({ _id: 's1', name: 'Loja X' });
});

test('loading mostra estado de carregamento', () => {
  render(<NewConversationPanel contacts={[]} stores={[]} search="" onSearch={() => {}} loading={true} onPick={() => {}} onBack={() => {}} />);
  expect(screen.getByText(/carregando/i)).toBeInTheDocument();
});

test('vazio mostra estado vazio', () => {
  render(<NewConversationPanel contacts={[]} stores={[]} search="" onSearch={() => {}} loading={false} onPick={() => {}} onBack={() => {}} />);
  expect(screen.getByText(/nenhum/i)).toBeInTheDocument();
});
