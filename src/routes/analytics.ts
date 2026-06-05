import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireSellerRole } from '../middleware/authorizeRoles';
import { authorizeCEO } from '../middleware/authorize';
import * as analytics from '../controllers/analyticsController';

const router = Router();

// Todas as rotas exigem autenticação
router.use(authenticate);

// ---------- STORE (lojista) ----------
router.get('/store/overview', requireSellerRole, analytics.storeOverview);
router.get('/store/sales-timeline', requireSellerRole, analytics.storeSalesTimeline);
router.get('/store/top-products', requireSellerRole, analytics.storeTopProducts);
router.get('/store/top-categories', requireSellerRole, analytics.storeTopCategories);
router.get('/store/peak-hours', requireSellerRole, analytics.storePeakHours);
router.get('/store/payment-methods', requireSellerRole, analytics.storePaymentMethods);
router.get('/store/customer-insights', requireSellerRole, analytics.storeCustomerInsights);

// ---------- PLATFORM (CEO) ----------
router.get('/platform/overview', authorizeCEO, analytics.platformOverview);
router.get('/platform/user-growth', authorizeCEO, analytics.platformUserGrowth);
router.get('/platform/orders-timeline', authorizeCEO, analytics.platformOrdersTimeline);
router.get('/platform/funnel', authorizeCEO, analytics.platformFunnel);
router.get('/platform/top-stores', authorizeCEO, analytics.platformTopStores);
router.get('/platform/top-categories', authorizeCEO, analytics.platformTopCategories);
router.get('/platform/live-users', authorizeCEO, analytics.platformLiveUsers);
router.get('/platform/user-heatmap', authorizeCEO, analytics.platformUserHeatmap);
router.get('/platform/retention', authorizeCEO, analytics.platformRetention);

export default router;
