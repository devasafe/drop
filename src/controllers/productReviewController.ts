import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from '../types';

const DELIVERED: any[] = ['entregue', 'delivered'];

/** Público — resumo + lista de avaliações de um produto. */
export const getProductReviews = async (req: Request, res: Response) => {
  try {
    const productId = String(req.params.id);
    const [agg, rows] = await Promise.all([
      prisma.productReview.aggregate({
        where: { productId },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      prisma.productReview.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    return res.json({
      average: agg._avg.rating ? Number(agg._avg.rating.toFixed(1)) : 0,
      count: agg._count._all,
      reviews: rows.map((r) => ({
        _id: r.id,
        rating: r.rating,
        comment: r.comment,
        userName: nameById.get(r.userId) || 'Cliente',
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error('[getProductReviews] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar avaliações' });
  }
};

/** Cliente — IDs dos produtos que ELE já avaliou naquele pedido. Hidrata a UI
 * após um reload: o "já avaliado" do produto não vinha do backend (diferente de
 * loja/motoboy), então um F5 zerava o estado local e os formulários reapareciam. */
export const getMyProductReviewsForOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orderId = String(req.params.id);
    const userId = String(req.user?.id || '');
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    const rows = await prisma.productReview.findMany({
      where: { orderId, userId },
      select: { productId: true },
    });
    return res.json({ reviewedProductIds: rows.map((r) => r.productId) });
  } catch (err) {
    console.error('[getMyProductReviewsForOrder] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar suas avaliações' });
  }
};

/** Cliente avalia um produto que comprou (pedido entregue). Idempotente por
 * (produto, usuário, pedido) — reavaliar atualiza. */
export const createProductReview = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = String(req.params.id);
    const userId = String(req.user?.id || '');
    const { rating, comment, orderId } = req.body || {};

    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    if (!orderId) return res.status(400).json({ error: 'orderId é obrigatório' });
    const nota = Number(rating);
    if (!nota || nota < 1 || nota > 5) return res.status(400).json({ error: 'Nota deve ser entre 1 e 5' });

    // O pedido tem que ser do usuário, estar entregue e conter o produto.
    const order = await prisma.order.findUnique({ where: { id: String(orderId) } });
    if (!order || String(order.customerId) !== userId) {
      return res.status(403).json({ error: 'Pedido não encontrado ou não é seu' });
    }
    if (!DELIVERED.includes(order.status)) {
      return res.status(400).json({ error: 'Só é possível avaliar após a entrega' });
    }
    const item = await prisma.orderItem.findFirst({ where: { orderId: String(orderId), productId } });
    if (!item) return res.status(400).json({ error: 'Esse produto não está nesse pedido' });

    const review = await prisma.productReview.upsert({
      where: { productId_userId_orderId: { productId, userId, orderId: String(orderId) } },
      update: { rating: nota, comment: comment || null },
      create: { productId, userId, orderId: String(orderId), rating: nota, comment: comment || null },
    });

    return res.status(201).json({ ...review, _id: review.id });
  } catch (err) {
    console.error('[createProductReview] error:', err);
    return res.status(500).json({ error: 'Erro ao enviar avaliação' });
  }
};
