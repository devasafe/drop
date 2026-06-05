import { Router, Request, Response } from 'express';
import User from '../models/User';
import PricingPlan from '../models/PricingPlan';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * PUT /api/store/plan
 * Loja escolhe qual plano quer estar enquadrada
 */
router.put('/plan', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { planId } = req.body;

    // Verificar se o user é lojista
    const user = await User.findById(userId);
    if (!user || !user.roles?.includes('lojista')) {
      return res.status(403).json({ error: 'Apenas lojistas podem escolher plano' });
    }

    // Verificar se o plano existe
    const plan = await PricingPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({ error: 'Plano não encontrado' });
    }

    // Atualizar user com o novo plano
    user.planId = planId.toString();
    await user.save();

    res.json({
      message: 'Plano atualizado com sucesso',
      planId,
      planName: plan.name,
      commission: plan.commission
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/store/plan
 * Retorna o plano atual do lojista
 */
router.get('/plan', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    const user = await User.findById(userId).populate('planId');
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (!user.planId) {
      return res.status(200).json({
        message: 'Lojista não escolheu plano ainda',
        planId: null,
        plan: null
      });
    }

    res.json({
      planId: user.planId,
      plan: user.planId
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
