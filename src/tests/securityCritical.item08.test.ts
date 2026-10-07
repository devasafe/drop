/**
 * Regressão (auditoria de segurança 2026-10-07) — item 8: nenhum broadcast global
 * (io.emit) pode carregar dado pessoal, PIN ou dado de pagamento; e o payload das
 * emissões não pode ir para o log (vazava PIN).
 *
 * Teste de contrato sobre os emissores de domínio, com o Socket.io falso.
 */
const globalEmits: { event: string; data: any }[] = [];
const roomEmits: { room: string; event: string; data: any }[] = [];

jest.mock('../services/notifier', () => {
  const io = {
    emit: (event: string, data: any) => { globalEmits.push({ event, data }); },
    to: (room: string) => ({ emit: (event: string, data: any) => { roomEmits.push({ room, event, data }); } }),
  };
  return { __esModule: true, default: { io }, io };
});

jest.mock('../services/pushService', () => ({
  notifyOnlineMotoboysNewDelivery: jest.fn(),
  notifyStoreOwner: jest.fn(),
  notifyAdmins: jest.fn(),
}));

jest.mock('../lib/prisma', () => ({
  prisma: { order: { findUnique: jest.fn().mockResolvedValue({ id: 'o1', _id: 'o1', customerId: 'c1', storeId: 's1' }) } },
}));

import * as emitter from '../utils/socketEmitter';

const FORBIDDEN_KEYS = [
  'pin', 'pinRetirada', 'pinDevolucao', 'customerId', 'customerAddress', 'customerLatitude',
  'customerLongitude', 'asaas', 'verification', 'cnpj', 'apiConfig', 'walletDistribution', 'userId',
];

function keysDeep(v: any, acc: Set<string> = new Set()): Set<string> {
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v)) {
      acc.add(k);
      keysDeep(val, acc);
    }
  }
  return acc;
}

const PIN = '98765';
const order = {
  _id: 'o1', storeId: 's1', customerId: 'c1', status: 'pago', totalValue: 50, deliveryFee: 9,
  products: [{ productId: 'p1', quantity: 1, price: 41 }], walletDistribution: { storeAmount: 30 },
};
const delivery = {
  id: 'd1', orderId: 'o1', motoboyId: 'm1', status: 'pending', fee: 9, distance: 4,
  pin: PIN, pinRetirada: PIN, pinDevolucao: PIN,
  customerAddress: 'Rua do Cliente, 10', customerLatitude: -23.5, customerLongitude: -46.6,
};
const store = {
  _id: 's1', id: 's1', ownerId: 'u1', name: 'Loja', isOpen: true, cnpj: '00000000000100',
  asaas: { walletId: 'w', apiKeyEncrypted: 'segredo' }, verification: { address: { comprovanteUrl: 'x' } },
  apiConfig: { token: 'x' },
};

beforeEach(() => {
  globalEmits.length = 0;
  roomEmits.length = 0;
  (console.log as jest.Mock).mockClear?.();
});

describe('Item 8 — broadcasts globais sem dado pessoal', () => {
  it('nenhum emissor de domínio faz io.emit com chave sensível', async () => {
    emitter.emitOrderCreated(order);
    emitter.emitDeliveryCreated(delivery);
    emitter.emitDeliveryLocationUpdated({ ...delivery, currentLocation: { lat: 1, lng: 2 } });
    emitter.emitNotificationReceived({ userId: 'c1', message: 'oi' });
    emitter.emitStoreCreated(store);
    emitter.emitStoreUpdated(store);
    emitter.emitOrderCancelled(order, { reason: 'x', cancelledBy: 'customer', refundAmount: 50 });
    emitter.emitDeliveryCompleted({ ...delivery, _id: 'd1' }, order);
    await new Promise((r) => setImmediate(r));

    for (const { event, data } of globalEmits) {
      const leaked = [...keysDeep(data)].filter((k) => FORBIDDEN_KEYS.includes(k));
      expect({ event, leaked }).toEqual({ event, leaked: [] });
    }
  });

  it('eventos de pedido e entrega não são globais (só salas)', async () => {
    emitter.emitOrderCreated(order);
    emitter.emitDeliveryCreated(delivery);
    emitter.emitOrderCancelled(order, { reason: 'x', cancelledBy: 'customer' });
    emitter.emitDeliveryCompleted({ ...delivery, _id: 'd1' }, order);
    emitter.emitNotificationReceived({ userId: 'c1', message: 'oi' });
    await new Promise((r) => setImmediate(r));
    const globalEvents = globalEmits.map((e) => e.event);
    expect(globalEvents).toEqual([]);
  });

  it('nova entrega vai para a sala motoboys com id correto e sem endereço do cliente', () => {
    emitter.emitDeliveryCreated(delivery);
    const toMotoboys = roomEmits.filter((e) => e.room === 'motoboys');
    expect(toMotoboys.length).toBeGreaterThan(0);
    for (const e of toMotoboys) {
      expect(e.data.deliveryId ?? e.data._id).toBe('d1');
      expect([...keysDeep(e.data)].filter((k) => FORBIDDEN_KEYS.includes(k))).toEqual([]);
    }
  });

  it('store:updated vai para a sala da loja (id), não do dono', () => {
    emitter.emitStoreUpdated(store);
    const rooms = roomEmits.filter((e) => e.event === 'store:updated').map((e) => e.room);
    expect(rooms).not.toContain('store:u1');
  });

  it('emissões não escrevem o payload (PIN) no log', () => {
    emitter.emitToRoom('user:c1', 'motoboy:assigned', { pin: PIN });
    const logged = (console.log as jest.Mock).mock.calls.flat().map(String).join(' ');
    expect(logged).not.toContain(PIN);
  });
});
