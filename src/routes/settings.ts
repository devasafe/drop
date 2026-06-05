import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getPlatformConfig,
  updatePlatformConfig,
  getStoreSubscription,
  requestPlanChange,
  getPendingPlanChanges,
  approvePlanChange,
  rejectPlanChange,
  getAllStoreSubscriptions,
  updateStorePlan,
} from '../controllers/settingsController';

const router = Router();

// Public - Get current config
router.get('/platform-config', getPlatformConfig);

// CEO Only - Update config
router.put('/platform-config', authenticate, updatePlatformConfig);

// Store - Get own subscription
router.get('/store-subscription', authenticate, getStoreSubscription);

// Store - Request plan change
router.post('/store-subscription/request-change', authenticate, requestPlanChange);

// CEO - Get pending changes
router.get('/pending-plan-changes', authenticate, getPendingPlanChanges);

// CEO - Approve plan change
router.post('/approve-plan-change', authenticate, approvePlanChange);

// CEO - Reject plan change
router.post('/reject-plan-change', authenticate, rejectPlanChange);

// CEO - Get all subscriptions
router.get('/all-store-subscriptions', authenticate, getAllStoreSubscriptions);

// ✨ CEO - Update store plan directly (+ comissão)
router.put('/store-plan', authenticate, updateStorePlan);

export default router;
