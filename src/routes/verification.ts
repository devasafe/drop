import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import { upload } from '../middleware/upload';
import {
  getMyVerification,
  resendEmailVerification,
  verifyEmail,
  sendPhoneOtp,
  verifyPhoneOtp,
  submitDocument,
  listPendingVerifications,
  approveDocument,
  rejectDocument,
} from '../controllers/verificationController';
import {
  submitFacial,
  submitStoreCnpj,
  submitStoreAddress,
  getStoreVerification,
  listPendingStoreVerifications,
  approveFacial,
  rejectFacial,
  approveStoreCnpj,
  rejectStoreCnpj,
  approveStoreAddress,
  rejectStoreAddress,
} from '../controllers/storeVerificationController';
import {
  submitCourier,
  getMyCourierVerification,
  listPendingCourier,
  approveCourier,
  rejectCourier,
} from '../controllers/courierVerificationController';

const router = Router();

// Status do próprio usuário
router.get('/me', authenticate, getMyVerification);

// Email
router.post('/email/resend', authenticate, resendEmailVerification);
router.post('/email/verify', authenticate, verifyEmail); // código digitado pelo usuário logado

// Telefone (OTP via WhatsApp)
router.post('/phone/send-otp', authenticate, sendPhoneOtp);
router.post('/phone/verify-otp', authenticate, verifyPhoneOtp);

// Documento (frente + verso)
router.post(
  '/document',
  authenticate,
  upload.fields([{ name: 'front', maxCount: 1 }, { name: 'back', maxCount: 1 }]),
  submitDocument
);

// Admin — fila de revisão (documentos do cliente).
// Autorização por PERMISSÃO (configurável no painel de cargos), não por role fixo.
const reviewClients = authorizePermission('verification:review_clients');
router.get('/admin/pending', authenticate, reviewClients, listPendingVerifications);
router.post('/admin/:userId/approve', authenticate, reviewClients, approveDocument);
router.post('/admin/:userId/reject', authenticate, reviewClients, rejectDocument);

// ===================== FASE 2: LOJA =====================
// Facial do dono
router.post('/facial', authenticate, upload.single('selfie'), submitFacial);
// CNPJ e endereço da loja
router.post('/store/:storeId/cnpj', authenticate, submitStoreCnpj);
router.post('/store/:storeId/address', authenticate, upload.single('comprovante'), submitStoreAddress);
router.get('/store/:storeId', authenticate, getStoreVerification);

// Admin — revisão de loja (facial/CNPJ/endereço)
const storeReviewers = authorizePermission('verification:review_stores');
router.get('/admin/store-pending', authenticate, storeReviewers, listPendingStoreVerifications);
router.post('/admin/facial/:userId/approve', authenticate, storeReviewers, approveFacial);
router.post('/admin/facial/:userId/reject', authenticate, storeReviewers, rejectFacial);
router.post('/admin/store/:storeId/cnpj/approve', authenticate, storeReviewers, approveStoreCnpj);
router.post('/admin/store/:storeId/cnpj/reject', authenticate, storeReviewers, rejectStoreCnpj);
router.post('/admin/store/:storeId/address/approve', authenticate, storeReviewers, approveStoreAddress);
router.post('/admin/store/:storeId/address/reject', authenticate, storeReviewers, rejectStoreAddress);

// ===================== FASE 3: MOTOBOY =====================
router.post('/motoboy', authenticate, upload.fields([{ name: 'platePhoto', maxCount: 1 }, { name: 'cnhPhoto', maxCount: 1 }]), submitCourier);
router.get('/motoboy/me', authenticate, getMyCourierVerification);

const courierReviewers = authorizePermission('verification:review_motoboys');
router.get('/admin/motoboy-pending', authenticate, courierReviewers, listPendingCourier);
router.post('/admin/motoboy/:userId/approve', authenticate, courierReviewers, approveCourier);
router.post('/admin/motoboy/:userId/reject', authenticate, courierReviewers, rejectCourier);

export default router;
