import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import Order from '../models/Order';
import Store from '../models/Store';
import Product from '../models/Product';
import { Types } from 'mongoose';

// Lista todos os pedidos do usuário autenticado
export const listOrders = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const orders = await Order.find({ customerId: userId }).sort({ createdAt: -1 }).lean();
    const enrichedOrders = await Promise.all(orders.map(async o => {
      // Nome da loja
      let storeName = 'Loja removida';
      if (o.storeId) {
        const storeObj = await Store.findById(o.storeId).select('name').lean();
        if (storeObj && storeObj.name) storeName = storeObj.name;
      }
      // Produtos
      let productsWithNames = [];
      if (Array.isArray(o.products)) {
        productsWithNames = await Promise.all(o.products.map(async (prod: any) => {
          let prodId = prod.productId;
          let productObj = null;
          if (prodId) {
            if (typeof prodId === 'string' && prodId.length === 24) {
              prodId = new Types.ObjectId(prodId);
            }
            productObj = await Product.findById(prodId).lean();
          }
          return {
            ...prod,
            productName: productObj ? productObj.name : 'Produto removido',
            image: productObj ? productObj.image : null,
            product: productObj
          };
        }));
      }
      return { ...o, storeName, products: productsWithNames };
    }));
    return res.json(enrichedOrders);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Erro ao listar pedidos' });
  }
};
