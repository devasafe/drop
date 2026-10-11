import { render, screen, fireEvent } from '@testing-library/react';
import api from '../../../lib/api';
import { StoreReviews } from '../StoreReviews';

jest.mock('../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;

it('mostra a última avaliação com comentário e "Ver N" abre a lista', async () => {
  get.mockResolvedValue({ data: [
    { storeRating: 5, storeComment: 'Chegou em 20 minutos, bem embalado.', createdAt: new Date().toISOString() },
    { storeRating: 4, storeComment: null, createdAt: new Date().toISOString() },
    { storeRating: 5, storeComment: 'Ótimo', createdAt: '2026-09-01T10:00:00' },
  ] });
  render(<StoreReviews storeId="s1" />);
  expect(await screen.findByText('"Chegou em 20 minutos, bem embalado."')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver 3' }));
  expect(screen.getByRole('dialog', { name: 'O que dizem' })).toBeInTheDocument();
  expect(screen.getByText('Ótimo')).toBeInTheDocument();
});

it('sem nenhum comentário: o bloco some', async () => {
  get.mockResolvedValue({ data: [{ storeRating: 5, storeComment: null, createdAt: new Date().toISOString() }] });
  const { container } = render(<StoreReviews storeId="s1" />);
  await new Promise((r) => setTimeout(r, 0));
  expect(container).toBeEmptyDOMElement();
});
