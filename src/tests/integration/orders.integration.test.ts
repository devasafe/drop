import request from 'supertest';
import app from '../../app';
import User from '../../models/User';
import Product from '../../models/Product';
import Store from '../../models/Store';
import Order from '../../models/Order';
import { connectDB } from '../../db';
import jwt from 'jsonwebtoken';

/**
 * ✅ TESTE DE INTEGRAÇÃO: Pedidos (Orders)
 * Testa endpoints críticos de criação e cancel de pedidos
 */

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

describe('Order Endpoints', () => {
  let customerId: string;
  let storeId: string;
  let productId: string;
  let authToken: string;

  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    // Limpar dados
    await User.deleteMany({});
    await Store.deleteMany({});
    await Product.deleteMany({});
    await Order.deleteMany({});

    // Criar usuário cliente
    const user = await User.create({
      name: 'Customer User',
      email: 'customer@test.com',
      passwordHash: 'hashed_password',
      role: 'cliente',
      roles: ['cliente'],
      activeRole: 'cliente'
    });
    customerId = user._id.toString();

    // Gerar token JWT
    authToken = jwt.sign({ id: customerId, role: 'cliente' }, JWT_SECRET, {
      expiresIn: '7d'
    });

    // Criar loja
    const store = await Store.create({
      name: 'Test Store',
      ownerId: customerId,
      address: {
        street: 'Rua Test',
        number: '123',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        cep: '01234567'
      }
    });
    storeId = store._id.toString();

    // Criar produto
    const product = await Product.create({
      name: 'Test Product',
      price: 50,
      quantity: 100,
      storeId: storeId,
      category: 'Test Category'
    });
    productId = product._id.toString();
  });

  /**
   * POST /api/orders
   */
  describe('POST /api/orders', () => {
    it('should create a new order with valid data', async () => {
      // Arrange
      const orderData = {
        storeId,
        products: [
          { productId, quantity: 2, price: 50 }
        ],
        deliveryDistanceKm: 5,
        paymentMethod: 'pix'
      };

      // Act
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData);

      // Assert
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('_id');
      expect(res.body.status).toBe('criado');
      expect(res.body.storeId).toBe(storeId);

      // Verificar que foi salvo no banco
      const order = await Order.findById(res.body._id);
      expect(order).toBeDefined();
      expect(order?.totalValue).toBeGreaterThan(0);
    });

    it('should return 401 if not authenticated', async () => {
      // Act
      const res = await request(app)
        .post('/api/orders')
        .send({
          storeId,
          products: [{ productId, quantity: 1, price: 50 }],
          deliveryDistanceKm: 5
        });

      // Assert
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 for missing products', async () => {
      // Act
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          storeId,
          products: [], // Vazio!
          deliveryDistanceKm: 5
        });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 for non-existent product', async () => {
      // Act
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          storeId,
          products: [
            { productId: '507f1f77bcf86cd799439999', quantity: 1, price: 50 }
          ],
          deliveryDistanceKm: 5
        });

      // Assert
      expect(res.status).toBe(404);
    });

    it('should decrement product quantity atomically', async () => {
      // Arrange
      const productBefore = await Product.findById(productId);
      const initialQuantity = productBefore?.quantity || 0;

      const orderData = {
        storeId,
        products: [{ productId, quantity: 5, price: 50 }],
        deliveryDistanceKm: 5,
        paymentMethod: 'pix'
      };

      // Act
      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData);

      // Assert
      const productAfter = await Product.findById(productId);
      expect(productAfter?.quantity).toBe(initialQuantity - 5);
    });
  });

  /**
   * DELETE /api/orders/:id (Cancel Order)
   */
  describe('DELETE /api/orders/:id', () => {
    let orderId: string;

    beforeEach(async () => {
      // Criar um pedido
      const order = await Order.create({
        customerId,
        storeId,
        status: 'criado',
        totalValue: 100,
        deliveryFee: 10,
        products: [{ productId, quantity: 2, price: 50 }],
        paymentStatus: 'pending'
      });
      orderId = order._id.toString();
    });

    it('should cancel an order', async () => {
      // Act
      const res = await request(app)
        .delete(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success');

      // Verificar que foi cancelado no banco
      const order = await Order.findById(orderId);
      expect(order?.status).toBe('cancelado');
    });

    it('should return 404 for non-existent order', async () => {
      // Act
      const res = await request(app)
        .delete('/api/orders/507f1f77bcf86cd799439999')
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(res.status).toBe(404);
    });

    it('should return 403 if user is not the order owner', async () => {
      // Arrange: criar outro usuário
      const otherUser = await User.create({
        name: 'Other User',
        email: 'other@test.com',
        passwordHash: 'hashed_password',
        role: 'cliente',
        roles: ['cliente'],
        activeRole: 'cliente'
      });

      const otherToken = jwt.sign({ id: otherUser._id, role: 'cliente' }, JWT_SECRET, {
        expiresIn: '7d'
      });

      // Act
      const res = await request(app)
        .delete(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      // Assert
      expect(res.status).toBe(403);
    });
  });
});
