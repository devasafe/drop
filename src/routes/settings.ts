import { Router } from 'express';
import { authenticate, optionalAuth } from '../middleware/auth';
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
  cancelPlanChangeRequest,
} from '../controllers/settingsController';
import { catchAsync } from '../middleware/errorHandler';

import { getSaasConfig } from '../utils/settlement';
import { hasCustodyLeftover } from '../services/custodyLeftover';
import logger from '../config/logger';
import env from '../config/env';
import { STORE_ASAAS_TERMS_VERSION, STORE_ASAAS_TERMS_TEXT, STORE_ASAAS_TERMS_CHANGES } from '../legal/storeAsaasTerms';

const router = Router();

// Public - flags do modo SaaS. Logado (ex.: lojista na tela de assinatura) também recebe a
// mensalidade padrão e os dias de teste; o anônimo mantém o formato público de antes.
router.get('/saas', optionalAuth, async (req: any, res) => {
  try {
    const { settlementMode, billingModel, directCardEnabled, saasMonthlyFee, saasTrialDays } = await getSaasConfig();
    const base = { settlementMode, billingModel, directCardEnabled, egressIp: env.DROP_EGRESS_IP || null };
    return res.json(req.user ? { ...base, saasMonthlyFee, saasTrialDays } : base);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao ler as configurações' });
  }
});

// Usuário - tem saldo da custódia sobrando no modo direto? (menu "Saldo do modo anterior", P16)
// Na custódia é sempre false: lá a carteira/saque já aparecem normalmente.
router.get('/custody-leftover', authenticate, async (req: any, res) => {
  try {
    if ((await getSaasConfig()).settlementMode !== 'direto') return res.json({ hasLeftover: false });
    return res.json({ hasLeftover: await hasCustodyLeftover(String(req.user.id)) });
  } catch (err) {
    logger.error('custody-leftover: falha ao consultar saldo de custódia', err as Error);
    return res.status(500).json({ error: 'Erro ao consultar o saldo' });
  }
});

// Public - termo de autorização da conta Asaas da loja (texto e versão vigentes)
router.get('/store-asaas-terms', (_req, res) => res.json({
  version: STORE_ASAAS_TERMS_VERSION,
  text: STORE_ASAAS_TERMS_TEXT,
  changes: STORE_ASAAS_TERMS_CHANGES[STORE_ASAAS_TERMS_VERSION] ?? [],
}));

// Public - Get current config
router.get('/platform-config', getPlatformConfig);

// Admin - Update config
router.put('/platform-config', authenticate, authorizePermission('settings:manage'), updatePlatformConfig);

// Store - Get own subscription (papel-base)
router.get('/store-subscription', authenticate, getStoreSubscription);

// Store - Request plan change (papel-base)
router.post('/store-subscription/request-change', authenticate, requestPlanChange);
// Store - Cancel pending plan change (papel-base)
router.delete('/store-subscription/request-change', authenticate, catchAsync(cancelPlanChangeRequest));

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
