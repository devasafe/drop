import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import Coupon from '../models/Coupon';
import Store from '../models/Store';
import logger from '../config/logger';

// Criar cupom
// Lojista: type='store', storeId obrigatório
// CEO: type='global' ou 'store'
export const createCoupon = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const activeRole = (req.user as any)?.activeRole || req.user?.role;

    const {
      code, type, discountType, discountValue,
      storeId, productIds, minOrderValue, maxUses,
      validFrom, validUntil,
    } = req.body;

    if (!code || !type || !discountType || discountValue == null || !validFrom || !validUntil) {
      return res.status(400).json({ error: 'Campos obrigatórios: code, type, discountType, discountValue, validFrom, validUntil' });
    }

    if (type === 'global' && activeRole !== 'ceo') {
      return res.status(403).json({ error: 'Apenas o CEO pode criar cupons globais' });
    }

    let resolvedStoreId = storeId;
    if (type === 'store' && activeRole === 'lojista') {
      const store = await Store.findOne({ ownerId: userId });
      if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
      resolvedStoreId = store._id;
    }

    if (type === 'store' && !resolvedStoreId) {
      return res.status(400).json({ error: 'storeId obrigatório para cupom de loja' });
    }

    if (discountType === 'percent' && (discountValue <= 0 || discountValue > 100)) {
      return res.status(400).json({ error: 'Desconto percentual deve ser entre 1 e 100' });
    }

    const coupon = await Coupon.create({
      code: String(code).toUpperCase().trim(),
      type,
      discountType,
      discountValue: Number(discountValue),
      storeId: resolvedStoreId || undefined,
      productIds: productIds || [],
      minOrderValue: minOrderValue ? Number(minOrderValue) : undefined,
      maxUses: maxUses ? Number(maxUses) : undefined,
      validFrom: new Date(validFrom),
      validUntil: new Date(validUntil),
      isActive: true,
      createdBy: userId,
    });

    return res.status(201).json(coupon);
  } catch (err: any) {
    if (err.code === 11000) return res.status(409).json({ error: 'Código de cupom já existe' });
    logger.error('Erro ao criar cupom', err);
    return res.status(500).json({ error: 'Erro ao criar cupom' });
  }
};

// Listar cupons
// Lojista: vê os da sua loja
// CEO: vê todos
export const listCoupons = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const activeRole = (req.user as any)?.activeRole || req.user?.role;

    let query: any = {};

    if (activeRole === 'ceo') {
      // CEO vê tudo, com filtro opcional
      if (req.query.storeId) query.storeId = req.query.storeId;
      if (req.query.type) query.type = req.query.type;
    } else if (activeRole === 'lojista') {
      const store = await Store.findOne({ ownerId: userId });
      if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
      query = { storeId: store._id };
    } else {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const coupons = await Coupon.find(query).sort({ createdAt: -1 }).lean();
    return res.json(coupons);
  } catch (err) {
    logger.error('Erro ao listar cupons', err as Error);
    return res.status(500).json({ error: 'Erro ao listar cupons' });
  }
};

// Toggle ativo/inativo
export const toggleCoupon = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const activeRole = (req.user as any)?.activeRole || req.user?.role;

    const coupon = await Coupon.findById(id);
    if (!coupon) return res.status(404).json({ error: 'Cupom não encontrado' });

    if (activeRole === 'lojista') {
      const store = await Store.findOne({ ownerId: userId });
      if (!store || coupon.storeId?.toString() !== store._id.toString()) {
        return res.status(403).json({ error: 'Sem permissão' });
      }
    } else if (activeRole !== 'ceo') {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();
    return res.json({ success: true, isActive: coupon.isActive });
  } catch (err) {
    logger.error('Erro ao toggler cupom', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// Deletar cupom
export const deleteCoupon = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const activeRole = (req.user as any)?.activeRole || req.user?.role;

    const coupon = await Coupon.findById(id);
    if (!coupon) return res.status(404).json({ error: 'Cupom não encontrado' });

    if (activeRole === 'lojista') {
      const store = await Store.findOne({ ownerId: userId });
      if (!store || coupon.storeId?.toString() !== store._id.toString()) {
        return res.status(403).json({ error: 'Sem permissão' });
      }
    } else if (activeRole !== 'ceo') {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    await coupon.deleteOne();
    return res.json({ success: true });
  } catch (err) {
    logger.error('Erro ao deletar cupom', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// Validar cupom e retornar desconto calculado
export const validateCoupon = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code, storeId, orderValue } = req.body;

    if (!code || !orderValue) {
      return res.status(400).json({ error: 'code e orderValue são obrigatórios' });
    }

    const result = await computeCouponDiscount(String(code), storeId, Number(orderValue));
    if (!result.valid) return res.status(400).json({ error: result.reason });

    return res.json({
      valid: true,
      discount: result.discount,
      finalValue: Number(orderValue) - result.discount,
      coupon: result.coupon,
    });
  } catch (err) {
    logger.error('Erro ao validar cupom', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// Função interna reutilizada pelo orderController
export async function computeCouponDiscount(
  code: string,
  storeId: string | undefined,
  orderValue: number
): Promise<{ valid: boolean; discount: number; reason?: string; coupon?: any }> {
  const now = new Date();
  const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });

  if (!coupon) return { valid: false, discount: 0, reason: 'Cupom não encontrado' };
  if (!coupon.isActive) return { valid: false, discount: 0, reason: 'Cupom inativo' };
  if (now < coupon.validFrom) return { valid: false, discount: 0, reason: 'Cupom ainda não é válido' };
  if (now > coupon.validUntil) return { valid: false, discount: 0, reason: 'Cupom expirado' };
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    return { valid: false, discount: 0, reason: 'Cupom esgotado' };
  }
  if (coupon.minOrderValue != null && orderValue < coupon.minOrderValue) {
    return { valid: false, discount: 0, reason: `Pedido mínimo de R$ ${coupon.minOrderValue.toFixed(2)} para este cupom` };
  }

  // Cupom de loja: só vale para esta loja
  if (coupon.type === 'store') {
    if (!storeId || coupon.storeId?.toString() !== storeId) {
      return { valid: false, discount: 0, reason: 'Cupom não válido para esta loja' };
    }
  }

  const discount = coupon.discountType === 'percent'
    ? Math.min(orderValue, (orderValue * coupon.discountValue) / 100)
    : Math.min(orderValue, coupon.discountValue);

  return { valid: true, discount: parseFloat(discount.toFixed(2)), coupon };
}
