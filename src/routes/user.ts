import { Router, Request, Response } from 'express';
import { getMe, updateMe, updatePhoto, getBankInfo, setBankInfo } from '../controllers/userController';
import { addAddress, listAddresses, removeAddress, editAddress, setDefaultAddress } from '../controllers/addressController';
import { authenticate } from '../middleware/auth';
import upload from '../middleware/upload';
import userRepository from '../repositories/user.repository';

const router = Router();

// Middleware de erro para upload (mesmo padrão de src/routes/auth.ts)
const handleUploadError = (err: any, req: any, res: any, next: any) => {
  if (err instanceof Error && err.message.includes('File')) {
    return res.status(400).json({ error: err.message });
  }
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File size exceeds 5MB limit' });
  }
  next(err);
};

// Dados do usuário autenticado
router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, updateMe);
router.post('/me/photo', authenticate, upload.single('photo'), handleUploadError, updatePhoto);

// Dados bancários do usuário
router.get('/bank-info', authenticate, getBankInfo);
router.post('/bank-info', authenticate, setBankInfo);

// ✅ NOVO: Rotas de endereço do usuário
router.get('/addresses', authenticate, listAddresses);
router.post('/addresses', authenticate, addAddress);
router.put('/addresses/:index', authenticate, editAddress);
router.delete('/addresses/:index', authenticate, removeAddress);
router.post('/addresses/set-default', authenticate, setDefaultAddress);

// ✅ NOVO: Trocar role ativo
router.put('/active-role', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { activeRole } = req.body;

    if (!activeRole) {
      return res.status(400).json({ error: 'activeRole é obrigatório' });
    }

    const user = await userRepository.findById(String(userId)) as any;
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Validar que o user tem esse role
    if (!user.roles?.includes(activeRole)) {
      return res.status(403).json({ error: 'Você não tem permissão para esse role' });
    }

    // Atualizar activeRole (Prisma; era user.save() do Mongoose)
    await userRepository.update(String(userId), { activeRole: activeRole as any });
    user.activeRole = activeRole;

    return res.json({
      message: 'Role ativado com sucesso',
      activeRole,
      roles: user.roles
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ✅ NOVO: Ver perfil público de qualquer usuário (sem autenticação)
router.get('/public/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // ✅ SEGURANÇA: endpoint PÚBLICO — não expor PII (email/telefone).
    const user = await userRepository.findById(String(userId)) as any;

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    return res.json({
      _id: user._id,
      name: user.name,
      roles: user.roles,
      activeRole: user.activeRole,
      createdAt: user.createdAt
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
