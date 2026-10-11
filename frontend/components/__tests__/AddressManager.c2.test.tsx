import { render, screen, fireEvent } from '@testing-library/react';
import api from '../../lib/api';
import AddressManager from '../AddressManager';

jest.mock('../MapPicker', () => ({ __esModule: true, default: () => null }));
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() } }));
const get = api.get as jest.Mock; const post = api.post as jest.Mock;

beforeEach(() => {
  get.mockReset(); post.mockReset();
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/user/addresses'
    ? [{ _id: 'a1', label: 'Casa', street: 'Av. Paulista', number: '1578', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP', cep: '01310-200', isDefault: true }]
    : { mainAddress: { _id: 'a1' } } }));
  post.mockResolvedValue({ data: {} });
});

test('linha do protótipo e ações no menu ⋯', async () => {
  render(<AddressManager />);
  expect(await screen.findByText('Padrão')).toBeInTheDocument();
  expect(screen.getByText('Av. Paulista, 1578 · Bela Vista')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mais ações para Casa' }));
  expect(screen.getByRole('dialog', { name: 'Casa' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
});

test('novo endereço: rótulo em chips', async () => {
  render(<AddressManager />);
  fireEvent.click(await screen.findByRole('button', { name: /Novo endereço/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Trabalho' }));
  expect(screen.getByRole('button', { name: 'Trabalho' })).toHaveAttribute('aria-pressed', 'true');
});
