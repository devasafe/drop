import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

jest.mock('../services/asaas/payment', () => ({
  __esModule: true,
  cancelCharge: jest.fn(async () => true),
}));

import { cancelCharge } from '../services/asaas/payment';
import Order from '../models/Order';
import Product from '../models/Product';
import { expireStalePixOrders } from '../services/asaas/expireOrders';

const cancelMock = cancelCharge as jest.Mock;
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => {
  for (const key in mongoose.connection.collections) await mongoose.connection.collections[key].deleteMany({});
  cancelMock.mockReset();
  cancelMock.mockResolvedValue(true);
});

async function staleOrder(productId: any, qty = 2, minutesAgo = 40, asaasPaymentId = 'pay_stale') {
  const order = await Order.create({
    customerId: new mongoose.Types.ObjectId(), storeId: new mongoose.Types.ObjectId(),
    products: [{ productId, quantity: qty, price: 50 }],
    totalValue: 100, deliveryFee: 0, status: 'criado', paymentMethod: 'pix',
    paymentStatus: 'pending', asaasPaymentId, asaasChargeStatus: 'pending',
  });
  // força createdAt no passado (timestamps:false p/ não sobrescrever)
  await Order.updateOne({ _id: order._id }, { $set: { createdAt: new Date(Date.now() - minutesAgo * 60000) } }, { timestamps: false } as any);
  return order;
}

describe('expireStalePixOrders (A — expiração PIX)', () => {
  it('cancela pedido vencido, devolve estoque e exclui a cobrança', async () => {
    const product = await Product.create({ storeId: new mongoose.Types.ObjectId(), name: 'P', price: 50, quantity: 5 } as any);
    const order = await staleOrder(product._id, 2);

    const n = await expireStalePixOrders();

    expect(n).toBe(1);
    expect(cancelMock).toHaveBeenCalledWith('pay_stale');
    const updated = await Order.findById(order._id);
    expect(updated!.status).toBe('cancelado');
    const p = await Product.findById(product._id);
    expect(p!.quantity).toBe(7); // 5 + 2 devolvidos
  });

  it('NÃO expira pedido recente', async () => {
    const product = await Product.create({ storeId: new mongoose.Types.ObjectId(), name: 'P', price: 50, quantity: 5 } as any);
    await staleOrder(product._id, 2, 1); // 1 min atrás

    const n = await expireStalePixOrders();
    expect(n).toBe(0);
    const p = await Product.findById(product._id);
    expect(p!.quantity).toBe(5);
  });

  it('se a cobrança já foi paga (não pôde excluir), NÃO cancela nem devolve estoque', async () => {
    cancelMock.mockResolvedValue(false); // já recebida
    const product = await Product.create({ storeId: new mongoose.Types.ObjectId(), name: 'P', price: 50, quantity: 5 } as any);
    const order = await staleOrder(product._id, 2);

    const n = await expireStalePixOrders();
    expect(n).toBe(0);
    const updated = await Order.findById(order._id);
    expect(updated!.status).toBe('criado'); // intacto — webhook vai confirmar
    const p = await Product.findById(product._id);
    expect(p!.quantity).toBe(5); // estoque NÃO devolvido
  });
});
