import { Router } from 'express';
import { register, login, switchRole, migrateUsersToMultiRole, forgotPassword, resetPassword, logout } from '../controllers/authController';
import upload, { handleUploadError } from '../middleware/upload';
import { createAuthLimiter } from '../middleware/authLimiter';
import { authenticate } from '../middleware/auth';
import { authorizeByActiveRole } from '../middleware/authorizeRoles';

const router = Router();

// ✅ SEGURANÇA: 25 tentativas por 15 min por IP (trust proxy em app.ts); 429 em JSON com a hora de volta.
const authLimiter = createAuthLimiter();

router.post('/register', authLimiter, upload.single('photo'), handleUploadError, register);
router.post('/login', authLimiter, login);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);
router.post('/logout', logout);
router.post('/switch-role', authenticate, switchRole);
router.post('/migrate-users', authenticate, authorizeByActiveRole('ceo'), migrateUsersToMultiRole);

export default router;
