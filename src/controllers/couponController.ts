import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import {
  insertCoupon,
  findCoupons,
  findCouponById,
  findCouponByCode,
  updateCoupon,
  removeCoupon,
} from '../repositories/coupon.repository';

import { z } from 'zod';
import logger from '../config/logger';
import { prisma } from '../lib/prisma';
import { isDirectMode } from '../utils/settlement';
import { AppError } from '../utils/AppError';

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
      const store = await prisma.store.findFirst({ where: { ownerId: userId } });
      if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
      resolvedStoreId = store.id;
    }

    if (type === 'store' && !resolvedStoreId) {
      return res.status(400).json({ error: 'storeId obrigatório para cupom de loja' });
    }

    if (discountType === 'percent' && (discountValue <= 0 || discountValue > 100)) {
      return res.status(400).json({ error: 'Desconto percentual deve ser entre 1 e 100' });
    }

    const coupon = await insertCoupon({
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
      // Só `true` literal torna o cupom público; qualquer outro valor mantém secreto.
      isPublic: req.body.isPublic === true,
      createdBy: userId,
    });

    return res.status(201).json(coupon);
  } catch (err: any) {
    // P2002 = violação de unique (code duplicado) no Prisma.
    if (err.code === 'P2002') return res.status(409).json({ error: 'Código de cupom já existe' });
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
      if (req.query.storeId) query.storeId = String(req.query.storeId);
      if (req.query.type) query.type = req.query.type;
    } else if (activeRole === 'lojista') {
      const store = await prisma.store.findFirst({ where: { ownerId: userId } });
      if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
      query = { storeId: store.id };
    } else {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const coupons = await findCoupons(query);
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

    const coupon = await findCouponById(id);
    if (!coupon) return res.status(404).json({ error: 'Cupom não encontrado' });

    if (activeRole === 'lojista') {
      const store = await prisma.store.findFirst({ where: { ownerId: userId } });
      if (!store || coupon.storeId?.toString() !== store.id.toString()) {
        return res.status(403).json({ error: 'Sem permissão' });
      }
    } else if (activeRole !== 'ceo') {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    // Encerrado não volta a valer (nem por toggle).
    if (coupon.endedAt) return sendCouponError(res, couponEnded());

    const updated = await updateCoupon(id, { isActive: !coupon.isActive });
    return res.json({ success: true, isActive: updated.isActive });
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

    const coupon = await findCouponById(id);
    if (!coupon) return res.status(404).json({ error: 'Cupom não encontrado' });

    if (activeRole === 'lojista') {
      const store = await prisma.store.findFirst({ where: { ownerId: userId } });
      if (!store || coupon.storeId?.toString() !== store.id.toString()) {
        return res.status(403).json({ error: 'Sem permissão' });
      }
    } else if (activeRole !== 'ceo') {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    await removeCoupon(id);
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

    // Modo direto: o Pix vai para a conta da loja e o DROP nao banca desconto global.
    // O POST /orders ja recusa (directCheckout, COUPON_NOT_ALLOWED); recusar aqui evita a Sacola
    // mostrar um desconto que o pagamento nao vai aceitar.
    if (result.coupon?.type === 'global' && (await isDirectMode())) {
      return res.status(400).json({ error: 'Cupons do DROP não valem nesta compra; cupons da loja sim.', code: 'COUPON_NOT_ALLOWED' });
    }

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
  const coupon = await findCouponByCode(code);

  if (!coupon) return { valid: false, discount: 0, reason: 'Cupom não encontrado' };
  if (coupon.endedAt) return { valid: false, discount: 0, reason: 'Cupom encerrado' };
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

// ---------- D1: cupom público, encerramento e resultados ----------

/** Corpo do PUT /coupons/:id: hoje só a visibilidade muda (valor e validade ficam). */
export const UpdateCouponSchema = z.object({ isPublic: z.boolean() }).strict();

export const couponEnded = () =>
  new AppError('Este cupom foi encerrado e não pode voltar a valer.', 409, true, 'COUPON_ENDED');

/** Mesmo formato do errorHandler global, para os handlers antigos que respondem por conta própria. */
export function sendCouponError(res: Response, err: AppError) {
  return res.status(err.statusCode).json({
    success: false,
    error: { message: err.message, statusCode: err.statusCode, ...(err.code ? { code: err.code } : {}) },
  });
}

/** Cupom que o usuário pode mexer: lojista dono da loja do cupom, ou CEO. Lança 404/403. */
export async function loadOwnedCoupon(req: AuthenticatedRequest, id: string): Promise<any> {
  const coupon = await findCouponById(id);
  if (!coupon) throw new AppError('Cupom não encontrado', 404, true, 'COUPON_NOT_FOUND');
  const activeRole = (req.user as any)?.activeRole || req.user?.role;
  if (activeRole === 'ceo') return coupon;
  if (activeRole === 'lojista') {
    const store = await prisma.store.findFirst({ where: { ownerId: req.user?.id }, select: { id: true } });
    if (store && coupon.storeId && String(coupon.storeId) === String(store.id)) return coupon;
  }
  throw new AppError('Sem permissão', 403, true, 'FORBIDDEN');
}

/** PUT /api/coupons/:id — muda a visibilidade (isPublic). Encerrado → 409 COUPON_ENDED. */
export async function updateCouponVisibility(req: AuthenticatedRequest, res: Response) {
  const coupon = await loadOwnedCoupon(req, String(req.params.id));
  if (coupon.endedAt) throw couponEnded();
  const saved = await updateCoupon(coupon.id, { isPublic: req.body.isPublic });
  return res.json({ success: true, data: saved });
}

/**
 * POST /api/coupons/:id/end — encerra o cupom de vez (isActive=false + endedAt).
 * updateMany condicional em `endedAt: null`: duas chamadas juntas → só uma encerra, a outra 409.
 */
export async function endCoupon(req: AuthenticatedRequest, res: Response) {
  const coupon = await loadOwnedCoupon(req, String(req.params.id));
  const r = await prisma.coupon.updateMany({
    where: { id: coupon.id, endedAt: null },
    data: { isActive: false, endedAt: new Date() },
  });
  if (r.count !== 1) throw couponEnded();
  logger.info('[coupon] cupom encerrado', { couponId: coupon.id, by: req.user?.id });
  return res.json({ success: true, data: await findCouponById(coupon.id) });
}
