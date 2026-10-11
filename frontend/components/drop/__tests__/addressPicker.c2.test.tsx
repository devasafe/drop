import { render, screen, fireEvent } from '@testing-library/react';
import { AddressPickerSheet } from '../AddressPickerSheet';

jest.mock('../../../hooks/useAddressQuotes', () => ({ useAddressQuotes: () => ({ loading: false, quotes: {
  a1: { storeId: 's1', inArea: true, etaMinutes: [25, 35], fee: 7.4, freeDelivery: false, open: true, distanceKm: 2, source: 'estimate' },
  a3: { storeId: 's1', inArea: false, reason: 'OUT_OF_AREA', etaMinutes: null, fee: null, freeDelivery: false, open: true, distanceKm: 20, source: 'estimate' },
} }) }));

const addresses = [
  { _id: 'a1', label: 'Casa', street: 'Av. Paulista', number: '1578', neighborhood: 'Bela Vista' },
  { _id: 'a3', label: 'Casa da mãe', street: 'R. Itapura', number: '900', neighborhood: 'Tatuapé' },
] as any[];

it('fora da área no escolhido: Alert com "Ver lojas que entregam lá"; campo de busca abre o cadastro', () => {
  const onSeeStores = jest.fn(); const onAddNew = jest.fn();
  render(<AddressPickerSheet open onClose={() => {}} addresses={addresses} selectedId="a3" storeId="s1" storeName="Eletro Center"
    onPick={() => {}} onAddNew={onAddNew} onSeeStores={onSeeStores} />);
  expect(screen.getByText('Fora da área')).toBeInTheDocument();
  expect(screen.getByText('~35 min · R$ 7,40')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver lojas que entregam lá' }));
  expect(onSeeStores).toHaveBeenCalledWith(addresses[1]);
  fireEvent.click(screen.getByRole('button', { name: 'Rua, número ou CEP' }));
  expect(onAddNew).toHaveBeenCalled();
});
