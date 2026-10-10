import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AddressPickerSheet } from '../AddressPickerSheet';
import { DeliveryAddressControl } from '../DeliveryAddressControl';
import { __resetStoreQuotesCache } from '../../../hooks/useStoreQuotes';
import api from '../../../lib/api';

jest.mock('../../../lib/api', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1' } }) }));
jest.mock('../../ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../checkout/AddressSheet', () => ({
  AddressSheet: ({ open, onSave, saving }: any) => (open ? <button disabled={saving} onClick={onSave}>Salvar endereço</button> : null),
}));
const post = api.post as jest.Mock;

const mk = (n: number) => Array.from({ length: n }, (_, i) => ({
  _id: `a${i}`, label: `End ${i}`, street: `Rua ${i}`, number: String(i + 1), latitude: String(-23.5 - i * 0.01), longitude: '-46.65',
}));
const quote = { storeId: 's1', inArea: true, etaMinutes: [25, 35], fee: 7.4, freeDelivery: false, open: true, distanceKm: 2, source: 'estimate' };

beforeEach(() => {
  __resetStoreQuotesCache();
  post.mockReset();
  post.mockResolvedValue({ data: { data: [quote] } });
});

test('reabrir o sheet com os mesmos endereços não repete os POSTs e mostra o cache na hora', async () => {
  const addresses = mk(2);
  const props = { onClose: jest.fn(), addresses, selectedId: 'a0', onPick: jest.fn(), onAddNew: jest.fn(), storeId: 's1' };
  const { rerender } = render(<AddressPickerSheet open {...props} />);
  await screen.findAllByText('~35 min · R$ 7,40');
  expect(post).toHaveBeenCalledTimes(2);
  rerender(<AddressPickerSheet open={false} {...props} />);
  rerender(<AddressPickerSheet open {...props} />);
  expect(screen.getAllByText('~35 min · R$ 7,40')).toHaveLength(2);
  expect(post).toHaveBeenCalledTimes(2);
});

test('cota no máximo 5 endereços', async () => {
  render(<AddressPickerSheet open onClose={jest.fn()} addresses={mk(7)} selectedId="a0" onPick={jest.fn()} onAddNew={jest.fn()} storeId="s1" />);
  await screen.findAllByText('~35 min · R$ 7,40');
  expect(post).toHaveBeenCalledTimes(5);
});

test('salvar endereço não dispara duas vezes enquanto salva', async () => {
  let resolve!: (v: any) => void;
  post.mockImplementation(() => new Promise((r) => { resolve = r; }));
  const picker = { open: false, setOpen: jest.fn(), request: jest.fn() };
  const address: any = { addresses: [], loading: false, selected: null, selectedId: null, point: null, label: '', select: jest.fn(), addAddress: jest.fn() };
  render(<DeliveryAddressControl address={address} picker={{ ...picker, open: true }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Novo endereço' }));
  const save = await screen.findByRole('button', { name: 'Salvar endereço' });
  fireEvent.click(save);
  fireEvent.click(save);
  expect(post).toHaveBeenCalledTimes(1);
  expect(save).toBeDisabled();
  await act(async () => { resolve({ data: { _id: 'n1' } }); });
  await waitFor(() => expect(address.addAddress).toHaveBeenCalledWith({ _id: 'n1' }));
});
