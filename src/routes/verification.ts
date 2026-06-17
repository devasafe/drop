import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth';
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

const router = Router();

// Status do próprio usuário
router.get('/me', authenticate, getMyVerification);

// Email
router.post('/email/resend', authenticate, resendEmailVerification);
router.post('/email/verify', verifyEmail); // público: o token identifica o usuário

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

// Admin — fila de revisão
const adminReviewers = authorizeRoles('ceo', 'gerente_geral', 'gerente_clientes');
router.get('/admin/pending', authenticate, adminReviewers, listPendingVerifications);
router.post('/admin/:userId/approve', authenticate, adminReviewers, approveDocument);
router.post('/admin/:userId/reject', authenticate, adminReviewers, rejectDocument);

export default router;
