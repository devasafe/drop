import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import User from '../models/User';
import Store from '../models/Store';
import Order from '../models/Order';
import Delivery from '../models/Delivery';

/**
 * GET /api/badges
 * Contagens de "trabalho a fazer" para alimentar os badges do menu:
 *  - verifications: itens pendentes na fila de verificação (admin)
 *  - storeOrders:   pedidos novos aguardando a loja aceitar (lojista)
 *  - deliveries:    entregas disponíveis no pool (motoboy)
 * São apenas números (não-sensíveis); o frontend só exibe o badge no item de menu
 * que o usuário de fato vê.
 */
export const getBadgeCounts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    const role = (req.user as any)?.activeRole || req.user?.role;
    const roles: string[] = (req.user as any)?.roles || (role ? [role] : []);

    const out = { verifications: 0, storeOrders: 0, deliveries: 0 };

    // Fila de verificação (cheia de count indexado). Mostrada só p/ quem revisa.
    const isStaff = roles.some((r) =>
      ['ceo', 'admin', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'].includes(r),
    );
    if (isStaff) {
      const [docs, facial, courier, stores] = await Promise.all([
        User.countDocuments({ 'verification.document.status': 'pending' }),
        User.countDocuments({ 'verification.facial.status': 'pending' }),
        User.countDocuments({ 'verification.courier.status': 'pending' }),
        Store.countDocuments({
          $or: [
            { 'verification.cnpj.status': 'pending' },
            { 'verification.address.status': 'pending' },
          ],
        }),
      ]);
      out.verifications = docs + facial + courier + stores;
    }

    // Pedidos novos da loja (aguardando aceite). Ignora PIX ainda não pago.
    if (role === 'lojista' || (role as string) === 'seller') {
      const store = await Store.findOne({ ownerId: userId }).select('_id');
      if (store) {
        out.storeOrders = await Order.countDocuments({
          storeId: store._id,
          status: 'criado',
          $or: [{ paymentStatus: { $ne: 'pending' } }, { paymentMethod: { $ne: 'pix' } }],
        });
      }
    }

    // Entregas disponíveis no pool (mesma query do listAvailableDeliveries).
    if (role === 'motoboy') {
      out.deliveries = await Delivery.countDocuments({
        status: 'pending',
        motoboyId: { $exists: false },
      });
    }

    return res.json(out);
  } catch (err) {
    console.error('Erro ao obter contagens de badges:', err);
    return res.status(500).json({ error: 'Erro ao obter contagens' });
  }
};
