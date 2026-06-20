import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireSellerRole } from '../middleware/authorizeRoles';
import { authorizePermission } from '../middleware/authorize';
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
router.get('/platform/overview', authorizePermission('analytics:view_platform'), analytics.platformOverview);
router.get('/platform/user-growth', authorizePermission('analytics:view_platform'), analytics.platformUserGrowth);
router.get('/platform/orders-timeline', authorizePermission('analytics:view_platform'), analytics.platformOrdersTimeline);
router.get('/platform/funnel', authorizePermission('analytics:view_platform'), analytics.platformFunnel);
router.get('/platform/top-stores', authorizePermission('analytics:view_platform'), analytics.platformTopStores);
router.get('/platform/top-categories', authorizePermission('analytics:view_platform'), analytics.platformTopCategories);
router.get('/platform/live-users', authorizePermission('analytics:view_platform'), analytics.platformLiveUsers);
router.get('/platform/user-heatmap', authorizePermission('analytics:view_platform'), analytics.platformUserHeatmap);
router.get('/platform/retention', authorizePermission('analytics:view_platform'), analytics.platformRetention);

export default router;
