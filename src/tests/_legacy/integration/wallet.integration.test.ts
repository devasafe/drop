import request from 'supertest';
import app from '../../app';
import User from '../../models/User';
import Wallet from '../../models/Wallet';
import { connectDB } from '../../db';
import jwt from 'jsonwebtoken';

/**
 * ✅ TESTE DE INTEGRAÇÃO: Carteiras (Wallets)
 * Testa endpoints críticos de depósito e saque
 */

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

describe('Wallet Endpoints', () => {
  let userId: string;
  let walletId: string;
  let authToken: string;

  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    // Limpar dados
    await User.deleteMany({});
    await Wallet.deleteMany({});

    // Criar usuário
    const user = await User.create({
      name: 'Wallet User',
      email: 'wallet@test.com',
      passwordHash: 'hashed_password',
      role: 'cliente',
      roles: ['cliente'],
      activeRole: 'cliente'
    });
    userId = user._id.toString();

    // Gerar token
    authToken = jwt.sign({ id: userId, role: 'cliente' }, JWT_SECRET, {
      expiresIn: '7d'
    });

    // Criar carteira
    const wallet = await Wallet.create({
      owner: userId,
      ownerType: 'user',
      balance: 100, // Começar com saldo
      totalIncome: 0,
      totalSpent: 0,
      history: []
    });
    walletId = wallet._id.toString();
  });

  /**
   * GET /api/wallets/:id
   */
  describe('GET /api/wallets/:id', () => {
    it('should get wallet balance', async () => {
      // Act
      const res = await request(app)
        .get(`/api/wallets/${userId}`)
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('_id');
      expect(res.body.balance).toBe(100);
    });

    it('should return 401 if not authenticated', async () => {
      // Act
      const res = await request(app)
        .get(`/api/wallets/${userId}`);

      // Assert
      expect(res.status).toBe(401);
    });
  });

  /**
   * POST /api/wallets/:id/credit (Depósito)
   */
  describe('POST /api/wallets/:id/credit', () => {
    it('should credit wallet with valid amount', async () => {
      // Arrange
      const creditData = {
        amount: 50,
        paymentMethod: 'pix',
        reference: 'Test deposit'
      };

      // Act
      const res = await request(app)
        .post(`/api/wallets/${userId}/credit`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(creditData);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('_id');
      expect(res.body.balance).toBe(150); // 100 + 50

      // Verificar que foi atualizado no banco
      const wallet = await Wallet.findById(walletId);
      expect(wallet?.balance).toBe(150);
    });

    it('should return 400 for invalid amount', async () => {
      // Act
      const res = await request(app)
        .post(`/api/wallets/${userId}/credit`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: -50, // Negativo!
          paymentMethod: 'pix'
        });

      // Assert
      expect(res.status).toBe(400);
    });

    it('should return 400 for amount exceeding max', async () => {
      // Act
      const res = await request(app)
        .post(`/api/wallets/${userId}/credit`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 200000, // Acima do máximo
          paymentMethod: 'pix'
        });

      // Assert
      expect(res.status).toBe(400);
    });
  });

  /**
   * POST /api/wallets/:id/withdraw (Saque)
   */
  describe('POST /api/wallets/:id/withdraw', () => {
    it('should withdraw from wallet with sufficient balance', async () => {
      // Arrange
      const withdrawData = {
        amount: 30,
        bankAccount: {
          banco: '001',
          agencia: '0001',
          conta: '123456-7',
          cpf_banco: '12345678901'
        }
      };

      // Act
      const res = await request(app)
        .post(`/api/wallets/${userId}/withdraw`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(withdrawData);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('_id');
      expect(res.body.balance).toBe(70); // 100 - 30

      // Verificar no banco
      const wallet = await Wallet.findById(walletId);
      expect(wallet?.balance).toBe(70);
    });

    it('should return 400 for insufficient balance', async () => {
      // Act
      const res = await request(app)
        .post(`/api/wallets/${userId}/withdraw`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 150, // Saldo é 100
          bankAccount: {
            banco: '001',
            agencia: '0001',
            conta: '123456-7',
            cpf_banco: '12345678901'
          }
        });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Insufficient balance');
    });

    it('should return 400 for invalid amount', async () => {
      // Act
      const res = await request(app)
        .post(`/api/wallets/${userId}/withdraw`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 0, // Inválido
          bankAccount: {
            banco: '001',
            agencia: '0001',
            conta: '123456-7',
            cpf_banco: '12345678901'
          }
        });

      // Assert
      expect(res.status).toBe(400);
    });
  });

  /**
   * GET /api/wallets/:id/history
   */
  describe('GET /api/wallets/:id/history', () => {
    it('should return wallet transaction history', async () => {
      // Arrange: fazer um crédito
      await request(app)
        .post(`/api/wallets/${userId}/credit`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 50,
          paymentMethod: 'pix',
          reference: 'Test'
        });

      // Act
      const res = await request(app)
        .get(`/api/wallets/${userId}/history`)
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });
});
