import { render, screen, fireEvent, within } from '@testing-library/react';
import api from '../../../lib/api';
import { StoreReviews } from '../StoreReviews';

jest.mock('../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;

it('mostra a resposta da loja abaixo da avaliação que foi respondida', async () => {
  get.mockResolvedValue({ data: [
    { orderId: 'o1', storeRating: 2, storeComment: 'Demorou um pouco', createdAt: new Date().toISOString(), storeReply: 'Desculpe, hoje faltou motoboy.', storeRepliedAt: new Date().toISOString() },
    { orderId: 'o2', storeRating: 5, storeComment: 'Perfeito', createdAt: new Date().toISOString(), storeReply: null, storeRepliedAt: null },
  ] });
  render(<StoreReviews storeId="s1" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ver 2' }));
  const dialog = screen.getByRole('dialog', { name: 'O que dizem' });
  expect(within(dialog).getAllByText('Resposta da loja')).toHaveLength(1);
  expect(within(dialog).getByText('Desculpe, hoje faltou motoboy.')).toBeInTheDocument();
  expect(within(dialog).getByText('Perfeito')).toBeInTheDocument();
});

it('sem nenhuma resposta: nada de "Resposta da loja"', async () => {
  get.mockResolvedValue({ data: [
    { orderId: 'o1', storeRating: 5, storeComment: 'Ótimo', createdAt: new Date().toISOString() },
  ] });
  render(<StoreReviews storeId="s1" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ver 1' }));
  expect(screen.queryByText('Resposta da loja')).toBeNull();
});
