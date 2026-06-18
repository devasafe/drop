import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, switchRole, migrateUsersToMultiRole, forgotPassword, resetPassword, logout } from '../controllers/authController';
import upload from '../middleware/upload';
import { authenticate } from '../middleware/auth';
import { authorizeByActiveRole } from '../middleware/authorizeRoles';

const router = Router();

// ✅ SEGURANÇA: Rate limiting para login/registro
// O Express já está configurado com "trust proxy" em app.ts
// então req.ip será corrigido automaticamente para X-Forwarded-For
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 25, // 25 tentativas (afrouxado p/ não travar usuários atrás de IP compartilhado)
  message: 'Muitas tentativas. Tente novamente em 15 minutos.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
});

// Middleware de erro para upload
const handleUploadError = (err: any, req: any, res: any, next: any) => {
  if (err instanceof Error && err.message.includes('File')) {
    return res.status(400).json({ error: err.message });
  }
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File size exceeds 5MB limit' });
  }
  next(err);
};

router.post('/register', authLimiter, upload.single('photo'), handleUploadError, register);
router.post('/login', authLimiter, login);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);
router.post('/logout', logout);
router.post('/switch-role', authenticate, switchRole);
router.post('/migrate-users', authenticate, authorizeByActiveRole('ceo'), migrateUsersToMultiRole);

export default router;
