import { Request, Response } from 'express';
import DeliveryInvoice from '../models/DeliveryInvoice';
import Store from '../models/Store';
import deliveryInvoiceService from '../services/deliveryInvoice.service';

type AuthenticatedRequest = Request & { user?: any };

/**
 * Verifica se o user logado é dono de alguma das lojas cujo id está na lista.
 * Usado para autorizar lojistas a verem notas de entregas feitas para sua(s) loja(s).
 */
async function userOwnsStore(userId: string, storeId: string): Promise<boolean> {
  const store = await Store.findOne({ _id: storeId, ownerId: userId }).select('_id').lean();
  return !!store;
}

export const getInvoice = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const invoice = await DeliveryInvoice.findById(id).lean();
    if (!invoice) return res.status(404).json({ error: 'Nota nao encontrada' });

    const userId = req.user?.id;
    const role = req.user?.activeRole || req.user?.role;
    const isAdmin = role === 'ceo' || role === 'admin';
    const isMotoboy = invoice.motoboyId.toString() === userId;
    const isCustomer = invoice.customerId.toString() === userId;
    const isStoreOwner = userId && (await userOwnsStore(userId, invoice.storeId.toString()));

    if (!isAdmin && !isMotoboy && !isCustomer && !isStoreOwner) {
      return res.status(403).json({ error: 'Sem permissao para ver esta nota' });
    }

    return res.json(invoice);
  } catch (err: any) {
    console.error('Erro ao buscar nota:', err);
    return res.status(500).json({ error: 'Erro ao buscar nota' });
  }
};

export const getInvoiceByOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const invoice = await deliveryInvoiceService.findByOrderId(orderId);
    if (!invoice) return res.status(404).json({ error: 'Nota nao encontrada para este pedido' });

    const userId = req.user?.id;
    const role = req.user?.activeRole || req.user?.role;
    const isAdmin = role === 'ceo' || role === 'admin';
    const isMotoboy = invoice.motoboyId.toString() === userId;
    const isCustomer = invoice.customerId.toString() === userId;
    const isStoreOwner = userId && (await userOwnsStore(userId, invoice.storeId.toString()));

    if (!isAdmin && !isMotoboy && !isCustomer && !isStoreOwner) {
      return res.status(403).json({ error: 'Sem permissao para ver esta nota' });
    }

    return res.json(invoice);
  } catch (err: any) {
    console.error('Erro ao buscar nota por pedido:', err);
    return res.status(500).json({ error: 'Erro ao buscar nota' });
  }
};

export const listMyInvoices = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Nao autenticado' });

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const invoices = await deliveryInvoiceService.listByMotoboy(userId, limit);
    return res.json({ invoices });
  } catch (err: any) {
    console.error('Erro ao listar notas:', err);
    return res.status(500).json({ error: 'Erro ao listar notas' });
  }
};
