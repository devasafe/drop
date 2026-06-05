/**
 * GUIA DE IMPLEMENTAÇÃO - COMO USAR AS NOVAS MELHORIAS
 * 
 * Este arquivo mostra exemplos práticos de como usar:
 * 1. Validação com Zod
 * 2. Rate limiting
 * 3. Logging centralizado
 * 4. Tratamento de erros padronizado
 * 5. Transações no banco de dados
 */

// ============================================================
// 1. COMO USAR A VALIDAÇÃO COM ZOD
// ============================================================

// ANTES (sem validação):
/**
export const register = async (req: AuthenticatedRequest, res: Response) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  // ... resto do código
};
*/

// DEPOIS (com validação):
/**
import { validate } from '../middleware/validate';
import { RegisterSchema } from '../validation/schemas';

router.post(
  '/register',
  validate(RegisterSchema, 'body'), // ← Middleware valida automaticamente
  register
);

export const register = async (req: AuthenticatedRequest, res: Response) => {
  // req.body já está validado e tipado!
  const { name, email, password, role } = req.body;
  // ... resto do código (sem validação manual)
};
*/

// ============================================================
// 2. COMO USAR RATE LIMITING
// ============================================================

// Atualizar src/app.ts ou src/index.ts:
/**
import { 
  generalLimiter, 
  loginLimiter, 
  registerLimiter,
  createOrderLimiter 
} from './middleware/rateLimiter';

const app = express();

// Aplicar rate limiting geral
app.use('/api/', generalLimiter);

// Aplicar limiters específicos
router.post('/auth/login', loginLimiter, login);
router.post('/auth/register', registerLimiter, register);
router.post('/orders', authenticate, createOrderLimiter, createOrder);
*/

// ============================================================
// 3. COMO USAR LOGGING CENTRALIZADO
// ============================================================

// ANTES (sem logging estruturado):
/**
console.log('[ORDER][CREATE] Criando pedido', { total, deliveryFee });
console.error(err);
console.log('[ORDER][CREATE] ✅ Pedido salvo');
*/

// DEPOIS (com logging centralizado):
/**
import { log } from '../config/logger';

// Iniciar operação
log.operation('ORDER_CREATE', { storeId, productCount: products.length });

// Log de sucesso
log.operationSuccess('ORDER_CREATE', { orderId: order._id, totalValue });

// Log de erro
log.operationError('ORDER_CREATE', error, { userId });

// Log de autenticação
log.auth('LOGIN_SUCCESS', userId);

// Log de transação
log.transaction('PAYMENT_PROCESSED', { orderId, amount, method });

// Log genérico com metadata
log.info('Order created', { orderId, customerId, totalValue });
*/

// ============================================================
// 4. COMO USAR TRATAMENTO DE ERROS PADRONIZADO
// ============================================================

// ANTES (inconsistente):
/**
if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
if (!authorized) return res.status(403).json({ error: 'Forbidden - not owner' });
throw new Error('Invalid product');
*/

// DEPOIS (padronizado):
/**
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  BusinessLogicError
} from '../utils/AppError';

// Lançar erros específicos
if (!order) throw new NotFoundError('Order');
if (!authorized) throw new AuthorizationError('Not order owner');
if (stock < quantity) throw new BusinessLogicError('Insufficient stock');
if (user.email === email) throw new ConflictError('Email already exists');

// No middleware error handler (já existe em errorHandler.ts):
// - Captura todos os AppError automaticamente
// - Responde com status code correto
// - Faz logging estruturado
// - Nunca expõe dados sensíveis
*/

// ============================================================
// 5. COMO USAR TRANSAÇÕES MONGOOSE
// ============================================================

// EXEMPLO: Update order with delivery

import mongoose from 'mongoose';
import Order from '../models/Order';
import Delivery from '../models/Delivery';

export const acceptOrderWithDelivery = async (orderId: string, driverId: string) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Buscar order dentro da transação
    const order = await Order.findById(orderId).session(session);
    if (!order) throw new NotFoundError('Order');

    // Criar delivery dentro da transação
    const delivery = new Delivery({
      orderId,
      driverId,
      status: 'pending'
    });
    await delivery.save({ session });

    // Atualizar order dentro da transação
    order.deliveryId = delivery._id;
    order.status = 'enviado';
    await order.save({ session });

    // ✅ COMMIT: Ambas as operações são salvas ou nenhuma
    await session.commitTransaction();

    log.operationSuccess('ACCEPT_ORDER_WITH_DELIVERY', {
      orderId,
      deliveryId: delivery._id
    });

    return { order, delivery };

  } catch (err) {
    // ❌ ROLLBACK: Se algo falhar, tudo volta ao estado anterior
    await session.abortTransaction();
    log.operationError('ACCEPT_ORDER_WITH_DELIVERY', err as Error);
    throw err;
  } finally {
    session.endSession();
  }
};

// ============================================================
// 6. EXEMPLO COMPLETO: REFATORAR AUTH CONTROLLER
// ============================================================

import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { validate } from '../middleware/validate';
import { LoginSchema, RegisterSchema } from '../validation/schemas';
import { AuthenticationError, ConflictError } from '../utils/AppError';
import { log } from '../config/logger';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User';

// Middleware para validar schema
// router.post('/login', validate(LoginSchema), login);
// router.post('/register', validate(RegisterSchema), register);

export const loginRefactored = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // req.body já está validado pelo middleware
    const { email, password } = req.body;

    log.operation('LOGIN', { email });

    // Buscar usuário
    const user = await User.findOne({ email });
    if (!user) {
      log.warn('Login failed - user not found', { email });
      throw new AuthenticationError('Email ou senha inválidos');
    }

    // Verificar senha
    const matched = await bcrypt.compare(password, user.passwordHash);
    if (!matched) {
      log.warn('Login failed - wrong password', { userId: user._id });
      throw new AuthenticationError('Email ou senha inválidos');
    }

    // Gerar token
    const token = jwt.sign(
      { id: user._id, role: user.activeRole || user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    log.operationSuccess('LOGIN', {
      userId: user._id,
      email: user.email,
      role: user.activeRole
    });

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.activeRole
        }
      }
    });

  } catch (err) {
    if (err instanceof AuthenticationError) {
      return res.status(401).json({
        success: false,
        error: { message: err.message }
      });
    }

    log.error('LOGIN - Unexpected error', err as Error);
    return res.status(500).json({
      success: false,
      error: { message: 'Erro ao fazer login' }
    });
  }
};

export const registerRefactored = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // req.body já está validado
    const { name, email, password, role } = req.body;

    log.operation('REGISTER', { email, role });

    // Verificar se usuário já existe
    const existing = await User.findOne({ email });
    if (existing) {
      log.warn('Register failed - email already exists', { email });
      throw new ConflictError('Este email já está cadastrado');
    }

    // Hash da senha
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Criar usuário
    const user = new User({
      name,
      email,
      passwordHash,
      role: role || 'cliente',
      roles: role && role !== 'cliente' ? [role, 'cliente'] : ['cliente'],
      activeRole: role || 'cliente'
    });

    await user.save();

    log.operationSuccess('REGISTER', {
      userId: user._id,
      email: user.email,
      role: user.activeRole
    });

    return res.status(201).json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        role: user.activeRole
      }
    });

  } catch (err) {
    if (err instanceof ConflictError) {
      return res.status(409).json({
        success: false,
        error: { message: err.message }
      });
    }

    log.error('REGISTER - Unexpected error', err as Error);
    return res.status(500).json({
      success: false,
      error: { message: 'Erro ao cadastrar' }
    });
  }
};

// ============================================================
// CHECKLIST DE IMPLEMENTAÇÃO
// ============================================================

/*
☐ 1. Instalar dependências:
      npm install zod express-rate-limit winston

☐ 2. Criar arquivos (já feito):
      src/validation/schemas.ts
      src/utils/AppError.ts
      src/middleware/rateLimiter.ts
      src/middleware/validate.ts
      src/config/logger.ts

☐ 3. Atualizar arquivo principal:
      - Importar generalLimiter
      - Aplicar na app.use('/api/', generalLimiter)
      - Importar errorHandler do middleware/errorHandler.ts
      - Aplicar na app.use(errorHandler)

☐ 4. Refatorar controllers um por um:
      - authController.ts
      - orderController.ts
      - productController.ts
      - ... outros

☐ 5. Atualizar rotas com validate middleware:
      router.post('/', validate(SchemaName), controller);

☐ 6. Testar cada mudança:
      npm test

☐ 7. Documentar em CHANGELOG.md

☐ 8. Comitar com git:
      git commit -m "refactor: add validation, logging, rate limiting"
*/
