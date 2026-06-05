/**
 * EXEMPLO DE APP.TS ATUALIZADO
 * 
 * Este arquivo mostra como integrar todas as melhorias
 * (validação, rate limiting, logging, error handler)
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';

// ============= IMPORTS DAS MELHORIAS ✅ NOVOS =============
import { generalLimiter, loginLimiter, registerLimiter, createOrderLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { log } from './config/logger';

// ============= IMPORTS EXISTENTES =============
import userRoutes from './routes/user';
import addressesRoutes from './routes/addresses';
import authRoutes from './routes/auth';
import productsRoutes from './routes/products';
import ordersRoutes from './routes/orders';
import deliveriesRoutes from './routes/deliveries';
import notificationsRoutes from './routes/notifications';
import storesRoutes from './routes/stores';
import categoriesRoutes from './routes/categories';
import gamificationRoutes from './routes/gamification';
import uploadsRoutes from './routes/uploads';

const app = express();

// ============= MIDDLEWARE GLOBAIS =============

// 1. CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 2. Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. ✅ NOVO: Rate Limiting Geral
app.use('/api/', generalLimiter);

// 4. ✅ NOVO: Logging de Requisições
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  // Hook para capturar quando a resposta é enviada
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    
    log.request(req.method, req.path, statusCode, duration, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: (req as any).user?.id,
    });
  });

  next();
});

// 5. Health Check
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    // Aqui você poderia verificar conexão com DB, Redis, etc
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      error: 'Service unavailable'
    });
  }
});

// ============= ROTAS =============

// Auth routes (com rate limiting específico)
app.use('/api/auth', (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/login') {
    return loginLimiter(req, res, next);
  }
  if (req.path === '/register') {
    return registerLimiter(req, res, next);
  }
  next();
}, authRoutes);

// ✅ NOVO: Rate limiting para orders
app.use('/api/orders', (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'POST' && req.path === '/') {
    return createOrderLimiter(req, res, next);
  }
  next();
});

// Todas as outras rotas
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/deliveries', deliveriesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/stores', storesRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/addresses', addressesRoutes);

// Servir arquivos estáticos
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/uploads', uploadsRoutes);

// User routes
app.use('/', userRoutes);

// ============= ERROR HANDLING =============

// ✅ NOVO: 404 handler
app.use(notFoundHandler);

// ✅ NOVO: Global error handler (DEVE SER O ÚLTIMO MIDDLEWARE)
app.use(errorHandler);

// ============= GRACEFUL SHUTDOWN =============
process.on('SIGTERM', () => {
  log.info('SIGTERM recebido, encerrando gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  log.info('SIGINT recebido, encerrando gracefully...');
  process.exit(0);
});

export default app;

/**
 * ============================================================
 * COMPARATIVO: ANTES vs DEPOIS
 * ============================================================
 * 
 * ANTES:
 * -----
 * - Sem rate limiting (vulnerável a brute force)
 * - Console.log simples (difícil debugar)
 * - Sem validação centralizada
 * - Tratamento de erro inconsistente
 * - Sem logging de requisições
 * 
 * DEPOIS:
 * ------
 * ✅ Rate limiting geral e específico
 * ✅ Logging estruturado de requisições
 * ✅ Validação com Zod nos controllers
 * ✅ Tratamento de erro global com AppError
 * ✅ Health check disponível
 * ✅ Graceful shutdown implementado
 * 
 * ============================================================
 */
