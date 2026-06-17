import { Router, Request, Response } from 'express';
import { getMe, getBankInfo, setBankInfo } from '../controllers/userController';
import { addAddress, listAddresses, removeAddress, editAddress, setDefaultAddress } from '../controllers/addressController';
import { authenticate } from '../middleware/auth';
import User from '../models/User';

const router = Router();

// Dados do usuário autenticado
router.get('/me', authenticate, getMe);

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

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Validar que o user tem esse role
    if (!user.roles?.includes(activeRole)) {
      return res.status(403).json({ error: 'Você não tem permissão para esse role' });
    }

    // Atualizar activeRole
    user.activeRole = activeRole as any;
    await user.save();

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
    const user = await User.findById(userId).select(
      'name roles activeRole createdAt'
    );

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
