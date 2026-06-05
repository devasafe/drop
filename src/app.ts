
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import env from './config/env';
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

const app = express();

// ✅ SEGURANÇA: Confiar em X-Forwarded-For (para proxies/load balancers)
app.set('trust proxy', 1); // Confiar no primeiro proxy na chain

// ✅ SEGURANÇA: CORS com whitelist (NÃO aberto para todas as origens)
const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin.endsWith(".vercel.app") || origin === "http://localhost:3000") {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(cookieParser()); // ✅ SEGURANÇA: Parse cookies

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

// Middleware para log de requisições
app.use((req, res, next) => {
	const start = Date.now();
	res.on('finish', () => {
		const duration = Date.now() - start;
		console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
	});
	next();
});

// Log MUITO CEDO para rotas de chat
app.use((req, res, next) => {
	if (req.path.includes('/chat') || req.baseUrl.includes('/chat')) {
		console.log(`🟡 [EARLY LOG] ${req.method} ${req.baseUrl}${req.path}`);
	}
	next();
});

// Log específico para requisições de chat (apenas em development)
if (process.env.NODE_ENV === 'development') {
	app.use((req, res, next) => {
		if (req.path.includes('/chat')) {
			console.log(`🔵 [CHAT REQUEST] ${req.method} ${req.path}`);
			console.log(`   Full URL: ${req.baseUrl}${req.path}`);
		}
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


app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/uploads', uploadsRoutes);

export default app;
