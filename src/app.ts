
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import path from 'path';
import env from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import userRoutes from './routes/user';
import authRoutes from './routes/auth';
import productsRoutes from './routes/products';
import ordersRoutes from './routes/orders';
import deliveriesRoutes from './routes/deliveries';
import notificationsRoutes from './routes/notifications';
import storesRoutes from './routes/stores';
import storeRoutes from './routes/storeRoutes'; // ✅ NOVO - Store endpoints
import categoriesRoutes from './routes/categories';
import gamificationRoutes from './routes/gamification';
import uploadsRoutes from './routes/uploads';
import walletsRoutes from './routes/wallets'; // ✅ NOVO
import debtsRoutes from './routes/debts';
import withdrawalsRoutes from './routes/withdrawals'; // ✅ NOVO - Withdrawal/Payout management
import adminRoutes from './routes/admin'; // ✅ NOVO - Admin routes
import pricingPlanRoutes from './routes/pricingPlanRoutes'; // ✅ NOVO - Pricing Plans
import settingsRoutes from './routes/settings'; // ✅ NOVO - Platform Settings
import chatRoutes from './routes/chat'; // ✅ CHAT ROUTES
import couponRoutes from './routes/coupons';
import rolePermissionsRoutes from './routes/role-permissions';
import supportRoutes from './routes/support';
import broadcastRoutes from './routes/broadcasts';
import rankingPrizesRoutes from './routes/ranking-prizes';
import analyticsRoutes from './routes/analytics'; // ✅ NOVO - Analytics
import walletAccessRoutes from './routes/walletAccess'; // ✅ NOVO - Wallet access requests
import payoutsRoutes from './routes/payouts'; // ✅ NOVO - Payout management
import deliveryInvoicesRoutes from './routes/deliveryInvoices';
import verificationRoutes from './routes/verification'; // ✅ NOVO - KYC/verificação de conta

const app = express();

// ✅ SEGURANÇA: Confiar em X-Forwarded-For (para proxies/load balancers)
app.set('trust proxy', 1); // Confiar no primeiro proxy na chain

// ✅ SEGURANÇA: Headers de proteção (XSS, clickjacking, sniffing, etc.)
app.use(helmet());

// ✅ SEGURANÇA: CORS com whitelist REAL (origens exatas configuradas em CORS_ORIGIN).
// Previews da Vercel (*.vercel.app) só são aceitos se ALLOW_VERCEL_PREVIEWS=true.
const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS === 'true';

app.use(cors({
  origin: (origin, callback) => {
    // Requisições sem Origin (curl, apps mobile, server-to-server) são permitidas
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (allowVercelPreviews && origin.endsWith('.vercel.app')) return callback(null, true);
    return callback(new Error(`CORS policy: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ✅ SEGURANÇA: limitar tamanho do payload (evita DoS por body gigante)
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser()); // ✅ SEGURANÇA: Parse cookies

// ✅ SEGURANÇA: NUNCA confiar no frontend — remover operadores ($, .) de
// inputs para prevenir NoSQL injection em queries do Mongo.
app.use(mongoSanitize());

// ✅ SEGURANÇA: Rate limiting para endpoints críticos
const validateAndFormatIp = (req: any): string => {
  let ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (ip?.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }
  return ip;
};

const authLimiter = rateLimit({
  windowMs: env.AUTH_LIMITER_WINDOW_MS,
  max: env.AUTH_LIMITER_MAX,
  message: 'Muitas tentativas de login/registro. Tente novamente em 15 minutos.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: validateAndFormatIp,
  skip: (req) => env.NODE_ENV === 'test',
});

const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Muitas requisições de pedidos. Aguarde um minuto.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: validateAndFormatIp,
  skip: (req) => env.NODE_ENV === 'test',
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: validateAndFormatIp,
  skip: (req) => env.NODE_ENV === 'test',
});

// Log de requisições — apenas fora de produção (evita ruído e vazamento de paths/dados em prod)
if (env.NODE_ENV !== 'production') {
	app.use((req, res, next) => {
		const start = Date.now();
		res.on('finish', () => {
			const duration = Date.now() - start;
			console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
		});
		next();
	});
}

// Health check endpoint
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ✅ CRÍTICO: Rotas genéricas de usuário ANTES das rotas específicas
// Senão /me, /bank-info são bloqueadas por ordem de matching
// Force reload - 2026-03-12 13:30
app.use('/api/user', userRoutes);

// ✅ Rotas específicas (mais específicas = depois)
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/deliveries', deliveriesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/stores', storesRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/chat', chatRoutes); // ✅ CHAT ROUTES
console.log('✅ [APP] Chat routes mounted at /api/chat');
app.use('/api/wallets', walletsRoutes);
app.use('/api/debts', debtsRoutes);
app.use('/api/withdrawals', withdrawalsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/pricing-plans', pricingPlanRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/role-permissions', rolePermissionsRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/broadcasts', broadcastRoutes);
app.use('/api/ranking-prizes', rankingPrizesRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/wallet-access', walletAccessRoutes);
app.use('/api/payouts', payoutsRoutes);
app.use('/api/invoices', deliveryInvoicesRoutes);
app.use('/api/verification', verificationRoutes);


app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/uploads', uploadsRoutes);

// ✅ 404 para rotas não mapeadas (resposta consistente)
app.use(notFoundHandler);

// ✅ SEGURANÇA: error handler global por último — captura erros, loga de forma
// estruturada e NUNCA vaza stack trace ao cliente em produção.
app.use(errorHandler);

export default app;
