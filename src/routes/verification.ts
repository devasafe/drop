import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import { upload } from '../middleware/upload';
import { syncMotoboysRoom } from '../services/notifier';

// Decisão de KYC de um usuário: depois da resposta 2xx, ajusta a sala `motoboys` das
// conexões abertas dele (aprovado entra na hora; reprovado sai).
const syncSocketsAfter = (req: any, res: any, next: any) => {
  res.on('finish', () => {
    if (res.statusCode < 300 && req.params?.userId) {
      syncMotoboysRoom(String(req.params.userId)).catch(() => undefined);
    }
  });
  next();
};
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
import { approveAllSubject, getVerificationStatsHandler } from '../controllers/verificationAdminController';
import { permissionCheckFor } from '../services/adminOps/common';
import logger from '../config/logger';
import type { SubjectKind } from '../services/verification/approveAll';

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
router.post('/admin/:userId/approve', authenticate, reviewClients, syncSocketsAfter, approveDocument);
router.post('/admin/:userId/reject', authenticate, reviewClients, syncSocketsAfter, rejectDocument);

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
router.post('/admin/facial/:userId/approve', authenticate, storeReviewers, syncSocketsAfter, approveFacial);
router.post('/admin/facial/:userId/reject', authenticate, storeReviewers, syncSocketsAfter, rejectFacial);
router.post('/admin/store/:storeId/cnpj/approve', authenticate, storeReviewers, approveStoreCnpj);
router.post('/admin/store/:storeId/cnpj/reject', authenticate, storeReviewers, rejectStoreCnpj);
router.post('/admin/store/:storeId/address/approve', authenticate, storeReviewers, approveStoreAddress);
router.post('/admin/store/:storeId/address/reject', authenticate, storeReviewers, rejectStoreAddress);

// ===================== FASE 3: MOTOBOY =====================
router.post('/motoboy', authenticate, upload.fields([{ name: 'platePhoto', maxCount: 1 }, { name: 'cnhPhoto', maxCount: 1 }]), submitCourier);
router.get('/motoboy/me', authenticate, getMyCourierVerification);

const courierReviewers = authorizePermission('verification:review_motoboys');
router.get('/admin/motoboy-pending', authenticate, courierReviewers, listPendingCourier);
router.post('/admin/motoboy/:userId/approve', authenticate, courierReviewers, syncSocketsAfter, approveCourier);
router.post('/admin/motoboy/:userId/reject', authenticate, courierReviewers, syncSocketsAfter, rejectCourier);

// ===================== D3b-2b: APROVAR TUDO =====================
// Permissão do tipo aqui; a de cada item (a facial é review_stores) no service. Sem syncSocketsAfter:
// o service ajusta a sala motoboys depois do commit, só se aprovou item da pessoa.
const subjectReviewers: Record<SubjectKind, ReturnType<typeof authorizePermission>> = {
  client: reviewClients,
  store: storeReviewers,
  motoboy: courierReviewers,
};
const subjectReviewer = (req: any, res: any, next: any) => subjectReviewers[req.params.kind as SubjectKind](req, res, next);
router.post('/admin/subject/:kind(client|store|motoboy)/:id/approve-all', authenticate, subjectReviewer, approveAllSubject);

// D3b-2b: espera da fila. Quem vê a fila (view_queue) ou decide qualquer tipo (review_*).
const VERIFICATION_VIEWERS = [
  'verification:view_queue',
  'verification:review_clients',
  'verification:review_stores',
  'verification:review_motoboys',
];
const anyVerificationViewer = async (req: any, res: any, next: any) => {
  try {
    const can = await permissionCheckFor(req.user);
    if (VERIFICATION_VIEWERS.some((p) => can(p))) return next();
    return res.status(403).json({ error: 'Permissão negada. Você precisa de: verification:view_queue', code: 'PERMISSION_DENIED' });
  } catch (err) {
    logger.error('[verification] falha ao conferir permissões da espera', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
router.get('/admin/stats', authenticate, anyVerificationViewer, getVerificationStatsHandler);

export default router;
