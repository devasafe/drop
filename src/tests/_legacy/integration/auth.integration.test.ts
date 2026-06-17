import request from 'supertest';
import app from '../../app';
import User from '../../models/User';
import { connectDB } from '../../db';

/**
 * ✅ TESTE DE INTEGRAÇÃO: Autenticação
 * Testa endpoints críticos de login e registro
 */

describe('Auth Endpoints', () => {
  // Conectar ao DB antes dos testes
  beforeAll(async () => {
    await connectDB();
  });

  // Limpar dados antes de cada teste
  beforeEach(async () => {
    await User.deleteMany({});
  });

  /**
   * POST /api/auth/register
   */
  describe('POST /api/auth/register', () => {
    it('should register a new user with valid data', async () => {
      // Arrange
      const userData = {
        name: 'Test User',
        email: 'test@test.com',
        password: 'Password123!',
        role: 'cliente'
      };

      // Act
      const res = await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Assert
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.email).toBe('test@test.com');

      // Verificar que foi salvo no banco
      const user = await User.findOne({ email: 'test@test.com' });
      expect(user).toBeDefined();
      expect(user?.name).toBe('Test User');
    });

    it('should return 400 for missing required fields', async () => {
      // Act
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User'
          // faltam email e password
        });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 409 if email already exists', async () => {
      // Arrange: criar primeiro usuário
      const userData = {
        name: 'Test User',
        email: 'test@test.com',
        password: 'Password123!',
        role: 'cliente'
      };
      await request(app).post('/api/auth/register').send(userData);

      // Act: tentar registrar com mesmo email
      const res = await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Assert
      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error');
    });
  });

  /**
   * POST /api/auth/login
   */
  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Criar usuário antes dos testes
      await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'test@test.com',
          password: 'Password123!',
          role: 'cliente'
        });
    });

    it('should login with valid credentials', async () => {
      // Act
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@test.com',
          password: 'Password123!'
        });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.userId).toBeDefined();
    });

    it('should return 401 for invalid credentials', async () => {
      // Act
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@test.com',
          password: 'WrongPassword123!'
        });

      // Assert
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 401 for non-existent user', async () => {
      // Act
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'Password123!'
        });

      // Assert
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });
});
