import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireActiveUser } from '../middleware/requireActive';
import { validate } from '../middleware/validate';
import {
  getWallet,
  getMyWallet,
  getStoreWallet,
  creditWallet,
  transferWallet,
  transferBetweenWallets,
  getWalletHistory,
  getPlatformMetrics,
  initializePlatformWallet,
  refundWallet,
  withdrawWallet,
  transferToMotoboyWallet,
  transferStoreToOwner,
  getMotoboyWallet,
  transferMotoboyToOwner
} from '../controllers/walletController';
import { authorizePermission, authorizeWalletOwner, authorizeWalletOwnerById } from '../middleware/authorize';
import {
  CreditWalletSchema,
  TransferWalletSchema
} from '../validation/schemas';

const router = Router();

// ✅ NOVO: Carteira baseado no role ativo
// Quando lojista está em "modo lojista", busca carteira de store
// Quando lojista está em "modo cliente", busca carteira de user
router.get('/my-wallet/by-role/:role', authenticate, getMyWallet);

// Transferir saldo da loja para a carteira do dono (user wallet)
router.post('/store/:storeId/transfer-to-owner', authenticate, requireActiveUser, transferStoreToOwner);

// Carteira de repasse do motoboy (ownerType='motoboy') + transferência para user wallet
router.get('/motoboy/:motoboyId', authenticate, getMotoboyWallet);
router.post('/motoboy/:motoboyId/transfer-to-owner', authenticate, requireActiveUser, transferMotoboyToOwner);

// Carteira do usuário logado
router.get('/my-wallet', authenticate, getMyWallet);
router.post('/transfer', authenticate, requireActiveUser, transferBetweenWallets);

// ✅ Transferir para carteira de motoboy
router.post('/transfer-to-motoboy', authenticate, requireActiveUser, transferToMotoboyWallet);

// Carteira do usuário (cliente, motoboy, etc)
router.get('/:userId', authenticate, authorizeWalletOwner, getWallet);
router.get('/:userId/history', authenticate, authorizeWalletOwner, getWalletHistory);
router.post(
  '/:userId/credit',
  authenticate,
  requireActiveUser,
  authorizeWalletOwner,
  validate(CreditWalletSchema),
  creditWallet
);
router.post(
  '/:userId/transfer',
  authenticate,
  requireActiveUser,
  authorizeWalletOwner,
  validate(TransferWalletSchema),
  transferWallet
);
router.post(
  '/:userId/refund',
  authenticate,
  requireActiveUser,
  authorizeWalletOwner,
  refundWallet
);

// ✅ Saque simples: remove saldo da carteira
router.post(
  '/:walletId/withdraw',
  authenticate,
  requireActiveUser,
  authorizeWalletOwnerById,
  withdrawWallet
);

// Carteira da loja
router.get('/store/:storeId', authenticate, getStoreWallet);

// Métricas da plataforma
router.get('/platform/metrics', authenticate, authorizePermission('analytics:view_platform'), getPlatformMetrics);

// Inicializar carteira da plataforma (admin setup)
router.post('/platform/initialize', authenticate, authorizePermission('settings:manage'), initializePlatformWallet);

export default router;
