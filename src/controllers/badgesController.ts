import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';
import { isDeliveryWithinRadius } from '../services/dispatch';
import { isMotoboyVerified } from '../utils/courierVerification';
import userRepository from '../repositories/user.repository';




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
        prisma.user.count({ where: { verification: { path: ['document', 'status'], equals: 'pending' } } }),
        prisma.user.count({ where: { verification: { path: ['facial', 'status'], equals: 'pending' } } }),
        prisma.user.count({ where: { verification: { path: ['courier', 'status'], equals: 'pending' } } }),
        prisma.store.count({
          where: {
            OR: [
              { verification: { path: ['cnpj', 'status'], equals: 'pending' } },
              { verification: { path: ['address', 'status'], equals: 'pending' } },
            ],
          },
        }),
      ]);
      out.verifications = docs + facial + courier + stores;
    }

    // Pedidos novos da loja (aguardando aceite). Ignora PIX ainda não pago.
    if (role === 'lojista' || (role as string) === 'seller') {
      const store = await prisma.store.findFirst({ where: { ownerId: userId } }) as any;
      if (store) {
        // "pedidos novos" para a loja = criados que não são PIX-ainda-pendente.
        out.storeOrders = await prisma.order.count({
          where: {
            storeId: store.id,
            status: 'criado',
            OR: [{ NOT: { paymentStatus: 'pending' } }, { NOT: { paymentMethod: 'pix' } }],
          },
        });
      }
    }

    // Entregas disponíveis PARA ESTE MOTOBOY. Espelha os mesmos gates da lista
    // (listAvailableDeliveries): KYC + online + raio. Um count cru do pool global
    // mostrava "1" mesmo com o motoboy offline ou a entrega fora do raio dele —
    // badge aceso sem nada acionável na tela.
    if (role === 'motoboy') {
      const me = await userRepository.findById(userId) as any;
      const kycOk = process.env.KYC_ENFORCED !== 'true' || isMotoboyVerified(me);
      if (kycOk && me?.isOnline) {
        const motoboyLoc = me?.currentLocation?.lat != null && me?.currentLocation?.lng != null
          ? { lat: me.currentLocation.lat, lng: me.currentLocation.lng }
          : null;
        const pendingAll = await prisma.delivery.findMany({
          where: { status: 'pending', motoboyId: null },
          select: { storeLatitude: true, storeLongitude: true, createdAt: true },
          take: 200,
        });
        const now = Date.now();
        out.deliveries = pendingAll.filter((d) => isDeliveryWithinRadius(d as any, motoboyLoc, now)).length;
      }
    }

    return res.json(out);
  } catch (err) {
    console.error('Erro ao obter contagens de badges:', err);
    return res.status(500).json({ error: 'Erro ao obter contagens' });
  }
};
