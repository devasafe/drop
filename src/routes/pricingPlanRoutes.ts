import { Router, Request, Response } from 'express';
import PricingPlan from '../models/PricingPlan';
import User from '../models/User';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * GET /api/admin/pricing-plans
 * Retorna todos os planos de preço
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const plans = await PricingPlan.find().sort({ name: 1 });
    res.json(plans);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/admin/pricing-plans/:planId
 * Atualiza um plano específico (APENAS ADMIN/CEO)
 */
router.put('/:planId', authenticate, async (req: Request, res: Response) => {
  try {
    // Verificar se é CEO
    const user = (req as any).user;
    if (user.role !== 'ceo' && !user.roles?.includes('ceo')) {
      return res.status(403).json({ error: 'Apenas CEO pode alterar planos' });
    }

    const { planId } = req.params;
    const { commission, motorcycleTaxes, minWithdraw } = req.body;

    // Validar dados
    if (commission < 0 || commission > 100) {
      return res.status(400).json({ error: 'Comissão deve estar entre 0 e 100' });
    }

    const plan = await PricingPlan.findByIdAndUpdate(
      planId,
      {
        commission,
        motorcycleTaxes: {
          basePerDelivery: motorcycleTaxes?.basePerDelivery || 0,
          perKm: motorcycleTaxes?.perKm || 0
        },
        minWithdraw
      },
      { new: true }
    );

    if (!plan) {
      return res.status(404).json({ error: 'Plano não encontrado' });
    }

    res.json(plan);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/pricing-plans/:planId
 * Retorna um plano específico com exemplo de distribuição
 */
router.get('/:planId', authenticate, async (req: Request, res: Response) => {
  try {
    const plan = await PricingPlan.findById(req.params.planId);
    
    if (!plan) {
      return res.status(404).json({ error: 'Plano não encontrado' });
    }

    // Calcular exemplo de distribuição para R$ 100
    const exampleAmount = 100;
    const adminCommission = (exampleAmount * plan.commission) / 100;
    const storeAmount = exampleAmount - adminCommission;

    res.json({
      ...plan.toObject(),
      example: {
        orderAmount: exampleAmount,
        adminCommission,
        storeAmount,
        percentages: {
          admin: plan.commission,
          store: 100 - plan.commission
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
