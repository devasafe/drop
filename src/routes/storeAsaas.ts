import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { catchAsync } from '../middleware/errorHandler';
import { createAuthLimiter } from '../middleware/authLimiter';
import {
  requireStoreOwner,
  connectSchema,
  checklistSchema,
  consentSchema,
  postConsent,
  putAsaas,
  getAsaas,
  postChecklist,
  postAuthToken,
  postTest,
  getStatement,
  postWithdrawal,
  withdrawalSchema,
} from '../controllers/storeAsaasController';

// Montado em /api/stores/:storeId/asaas — conexão da conta Asaas própria da loja (modo direto).
const router = Router({ mergeParams: true });

router.use(authenticate, authorizeRoles('lojista'), requireStoreOwner);

router.put('/', validate(connectSchema), catchAsync(putAsaas));
router.get('/', catchAsync(getAsaas));
router.post('/checklist', validate(checklistSchema), catchAsync(postChecklist));
router.post('/auth-token', catchAsync(postAuthToken));
router.post('/consent', validate(consentSchema), catchAsync(postConsent));
router.post('/test', catchAsync(postTest));
// Extrato da conta de recebimento e saque para o Pix no CPF/CNPJ do dono (senha da DROP).
router.get('/extrato', catchAsync(getStatement));
// Pede a senha: limitado como o login (adivinhar a senha por aqui não pode ser mais fácil).
// Contado por usuário (não por IP): trocar de IP não dá mais tentativas.
const withdrawalLimiter = createAuthLimiter({ max: 5, keyGenerator: (req) => `saque:${(req as any).user?.id ?? req.ip}` });
router.post('/saque', withdrawalLimiter, validate(withdrawalSchema), catchAsync(postWithdrawal));

export default router;
