import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
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

// Admin - Update config
router.put('/platform-config', authenticate, authorizePermission('settings:manage'), updatePlatformConfig);

// Store - Get own subscription (papel-base)
router.get('/store-subscription', authenticate, getStoreSubscription);

// Store - Request plan change (papel-base)
router.post('/store-subscription/request-change', authenticate, requestPlanChange);

// Admin - Get pending changes
router.get('/pending-plan-changes', authenticate, authorizePermission('plan:view'), getPendingPlanChanges);

// Admin - Approve plan change
router.post('/approve-plan-change', authenticate, authorizePermission('plan:approve'), approvePlanChange);

// Admin - Reject plan change
router.post('/reject-plan-change', authenticate, authorizePermission('plan:approve'), rejectPlanChange);

// Admin - Get all subscriptions
router.get('/all-store-subscriptions', authenticate, authorizePermission('plan:view'), getAllStoreSubscriptions);

// Admin - Update store plan directly (+ comissão)
router.put('/store-plan', authenticate, authorizePermission('plan:manage'), updateStorePlan);

export default router;
