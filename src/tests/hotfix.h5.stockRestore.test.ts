/**
 * H5 — pedido recusado devolve o estoque. O laço de itens baixa o estoque e três retornos de
 * erro (método de pagamento com Asaas, saldo insuficiente, subtotal inválido) saíam sem devolvê-lo:
 * repetir `paymentMethod:'boleto'` zerava o estoque de qualquer loja.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import app from '../app';
import { createOrder } from '../controllers/orderController';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { ownerIdForStore } from './helpers/storeOwner';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createWallet } from './helpers/financePg';
import { ensurePlatformConfig, updatePlatformConfig } from '../repositories/platformConfig.repository';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';
const DOMAIN = '@hotfixh5.test';

let restoreConfig: () => Promise<void>;
let gatewayOriginal: any;

beforeAll(async () => {
  gatewayOriginal = env.PAYMENT_GATEWAY;
  restoreConfig = await snapshotPlatformConfig();
  await ensurePlatformConfig('system');
  await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'system');
}, 60000);

afterAll(async () => {
  env.PAYMENT_GATEWAY = gatewayOriginal;
  await restoreConfig();
});

afterEach(async () => {
  env.PAYMENT_GATEWAY = gatewayOriginal;
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function buyer() {
  const user = await prisma.user.create({
    data: {
      name: 'Comprador h5',
      email: `buyer-${Date.now()}-${Math.random().toString(36).slice(2)}${DOMAIN}`,
      passwordHash: await bcrypt.hash('Senha123!', 10),
      role: 'cliente', roles: ['cliente'], activeRole: 'cliente',
      verification: {
        email: { status: 'verified' },
        phone: { status: 'verified' },
        document: { status: 'approved', type: 'cpf', number: '12345678909' },
      },
    },
  });
  await createWallet({ owner: user.id, ownerType: 'user', balance: 0, totalIncome: 0, totalSpent: 0 });
  const token = jwt.sign({ id: user.id, role: 'cliente', activeRole: 'cliente', roles: ['cliente'] }, JWT_SECRET);
  return { user, token };
}

async function lojaEProduto() {
  const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja h5', isOpen: true } });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 100, quantity: 10 } } as any);
  return { store, product };
}

const stockOf = async (id: string) => (await prisma.product.findUnique({ where: { id } }))?.quantity;

function post(token: string, body: any) {
  return request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send({
    deliveryDistanceKm: 0, address: 'Rua X, 1 - Centro', ...body,
  });
}

describe('H5 — recusa devolve o estoque', () => {
  it('Asaas + método fora de pix e cartão (money passa no Zod): 400 e estoque intacto, mesmo repetindo', async () => {
    env.PAYMENT_GATEWAY = 'asaas';
    const { token } = await buyer();
    const { store, product } = await lojaEProduto();
    for (let i = 0; i < 3; i++) {
      const res = await post(token, { storeId: store.id, products: [{ productId: product.id, quantity: 2 }], paymentMethod: 'money' });
      expect(res.status).toBe(400);
    }
    expect(await stockOf(product.id)).toBe(10);
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
  });

  it('saldo insuficiente na carteira (fluxo legado): 400 e estoque intacto', async () => {
    // WALLET_INSUFFICIENT (paymentMethod "wallet") é inalcançável: o Zod só aceita credit_card/pix/money,
    // com Asaas o método é barrado antes e sem Asaas o ramo legado recusa antes dele. Cobrimos o
    // retorno "Saldo insuficiente" do ramo legado, que é o alcançável.
    env.PAYMENT_GATEWAY = 'none';
    const { token } = await buyer();
    const { store, product } = await lojaEProduto();
    const res = await post(token, { storeId: store.id, products: [{ productId: product.id, quantity: 2 }], paymentMethod: 'pix' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Saldo insuficiente/);
    expect(await stockOf(product.id)).toBe(10);
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
  });

  it('subtotal inválido (quantidade negativa, chamando o controller direto: o Zod barra na rota): 400 e estoque intacto', async () => {
    env.PAYMENT_GATEWAY = 'asaas';
    const { user } = await buyer();
    const { store, product } = await lojaEProduto();
    const req: any = {
      user: { id: user.id, role: 'cliente', activeRole: 'cliente' },
      body: { storeId: store.id, products: [{ productId: product.id, quantity: -1 }], paymentMethod: 'pix', deliveryDistanceKm: 0, address: 'Rua X, 1 - Centro' },
    };
    let status = 0; let body: any;
    const res: any = { status(c: number) { status = c; return res; }, json(b: any) { body = b; return res; } };
    await createOrder(req, res);
    expect(status).toBe(400);
    expect(body.error).toMatch(/Subtotal inválido/);
    expect(await stockOf(product.id)).toBe(10);
  });
});
