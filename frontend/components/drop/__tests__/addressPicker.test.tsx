import { render, screen, fireEvent } from '@testing-library/react';
import { AddressPickerSheet } from '../AddressPickerSheet';
import { DeliveryBadge } from '../DeliveryBadge';
import api from '../../../lib/api';

jest.mock('../../../lib/api', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));
const post = api.post as jest.Mock;

const addresses = [
  { _id: 'a1', label: 'Casa', street: 'Av. Paulista', number: '1578', neighborhood: 'Bela Vista', latitude: '-23.56', longitude: '-46.65' },
  { _id: 'a2', label: 'Casa da mãe', street: 'R. Itapura', number: '900', neighborhood: 'Tatuapé', latitude: '-23.54', longitude: '-46.57' },
];

beforeEach(() => {
  post.mockReset();
  post.mockImplementation((_url: string, body: any) => Promise.resolve({
    data: { data: [body.latitude === -23.56
      ? { storeId: 's1', inArea: true, etaMinutes: [25, 35], fee: 7.4, freeDelivery: false, open: true, distanceKm: 2.4, source: 'estimate' }
      : { storeId: 's1', inArea: false, reason: 'OUT_OF_AREA', etaMinutes: null, fee: null, freeDelivery: false, open: true, distanceKm: 14, source: 'estimate' }] },
  }));
});

test('lista os endereços, marca o escolhido e devolve o toque', () => {
  const onPick = jest.fn();
  render(<AddressPickerSheet open onClose={jest.fn()} addresses={addresses} selectedId="a1" onPick={onPick} onAddNew={jest.fn()} />);
  expect(screen.getByRole('dialog', { name: 'Onde entregar?' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Casa\s*Av\. Paulista, 1578/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: /Casa da mãe/ }));
  expect(onPick).toHaveBeenCalledWith(addresses[1]);
});

test('com loja: prazo e frete por endereço, e "Fora da área" antes de escolher', async () => {
  render(<AddressPickerSheet open onClose={jest.fn()} addresses={addresses} selectedId="a1" onPick={jest.fn()} onAddNew={jest.fn()} storeId="s1" storeName="Eletro Center" />);
  expect(await screen.findByText('~35 min · R$ 7,40')).toBeInTheDocument();
  expect(screen.getByText('Fora da área')).toBeInTheDocument();
  expect(post).toHaveBeenCalledWith('/stores/quotes', { latitude: -23.56, longitude: -46.65, storeIds: ['s1'] });
});

test('sem endereço salvo: convite para cadastrar', () => {
  const onAddNew = jest.fn();
  render(<AddressPickerSheet open onClose={jest.fn()} addresses={[]} selectedId={null} onPick={jest.fn()} onAddNew={onAddNew} />);
  expect(screen.getByText('Você ainda não tem endereço salvo.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Novo endereço' }));
  expect(onAddNew).toHaveBeenCalled();
});

test('DeliveryBadge closed', () => {
  const { rerender } = render(<DeliveryBadge state={{ kind: 'closed', opensAt: '09:00' }} />);
  expect(screen.getByText('Loja fechada · abre às 09:00')).toBeInTheDocument();
  rerender(<DeliveryBadge state={{ kind: 'closed' }} />);
  expect(screen.getByText('Loja fechada')).toBeInTheDocument();
});
