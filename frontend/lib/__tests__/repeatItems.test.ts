import { repeatItems } from '../repeatItems';

const now = new Date('2026-10-11T12:00:00');
const orders = [
  { _id: 'o3', status: 'entregue', storeId: 's1', storeName: 'Eletro Center', createdAt: '2026-10-10T10:00:00', products: [{ productId: 'cabo', productName: 'Cabo USB-C', price: 39.9 }] },
  { _id: 'o2', status: 'entregue', storeId: 's9', storeName: 'Pet&Cia', createdAt: '2026-09-13T10:00:00', products: [{ productId: 'racao', productName: 'Ração Golden', price: 89.9 }] },
  { _id: 'o1', status: 'entregue', storeId: 's1', storeName: 'Eletro Center', createdAt: '2026-09-01T10:00:00', products: [{ productId: 'cabo', productName: 'Cabo USB-C', price: 39.9 }] },
  { _id: 'o0', status: 'cancelado', storeId: 's1', storeName: 'Eletro Center', createdAt: '2026-10-11T08:00:00', products: [{ productId: 'capa', productName: 'Capa', price: 49.9 }] },
];

it('mais recente primeiro, sem cancelados, com a linha de apoio do protótipo', () => {
  expect(repeatItems(orders, now).map((r) => [r.productId, r.meta])).toEqual([
    ['cabo', 'Comprado 2 vezes · Eletro Center'],
    ['racao', 'Último pedido há 28 dias · Pet&Cia'],
  ]);
});
