import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import {
  insertBroadcast,
  updateBroadcastById,
  findBroadcastById,
  removeBroadcast,
  countBroadcasts,
  listBroadcastsWithCreator,
} from '../repositories/broadcast.repository';
import { insertNotifications, deleteNotificationsByBroadcast } from '../repositories/notification.repository';
import { prisma } from '../lib/prisma';
import { emitToRoom } from '../utils/socketEmitter';
import logger from '../config/logger';
import { getEffectivePermissions } from './rolePermissionsController';

const VALID_ROLES = ['cliente', 'lojista', 'motoboy', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys', 'gerente_geral', 'marketing', 'ceo'];

// Criar e enviar broadcast
export const createBroadcast = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const activeRole = (req.user as any)?.activeRole || req.user?.role;
    const { title, body, targetRoles } = req.body;

    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: 'title e body são obrigatórios' });
    }

    if (!Array.isArray(targetRoles) || targetRoles.length === 0) {
      return res.status(400).json({ error: 'Selecione pelo menos um grupo alvo' });
    }

    // Validar que os roles enviados são válidos
    const invalidRoles = targetRoles.filter((r: string) => !VALID_ROLES.includes(r));
    if (invalidRoles.length > 0) {
      return res.status(400).json({ error: `Grupos inválidos: ${invalidRoles.join(', ')}` });
    }

    // CEO pode enviar para todos; outros roles verificam notificationTargets
    let allowedTargets: string[] = VALID_ROLES;
    if (activeRole !== 'ceo') {
      try {
        const { notificationTargets } = await getEffectivePermissions(activeRole);
        allowedTargets = notificationTargets;
      } catch {
        allowedTargets = [];
      }
      const forbidden = targetRoles.filter((r: string) => !allowedTargets.includes(r));
      if (forbidden.length > 0) {
        return res.status(403).json({ error: `Você não tem permissão para enviar para: ${forbidden.join(', ')}` });
      }
    }

    const broadcast = await insertBroadcast({
      title: title.trim(),
      body: body.trim(),
      targetRoles,
      createdBy: userId,
      sentAt: new Date(),
    });

    // Buscar todos os usuários com os roles alvo (em lotes para não sobrecarregar)
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { role: { in: targetRoles as any } },
          { roles: { hasSome: targetRoles as any } },
          { activeRole: { in: targetRoles as any } },
        ],
      },
      select: { id: true },
    });

    if (users.length === 0) {
      await updateBroadcastById(broadcast._id, { deliveryCount: 0 });
      return res.status(201).json({ ...broadcast, deliveryCount: 0 });
    }

    // Criar notificações em lotes
    const BATCH = 500;
    let totalCreated = 0;
    for (let i = 0; i < users.length; i += BATCH) {
      const batch = users.slice(i, i + BATCH);
      const notifDocs = batch.map(u => ({
        userId: u.id,
        title: title.trim(),
        message: body.trim(),
        type: 'broadcast' as const,
        broadcastId: broadcast._id,
        read: false,
      }));
      await insertNotifications(notifDocs);
      totalCreated += batch.length;

      // Emite via socket para cada usuário (notification:received — ouvido por useNotifications)
      for (const u of batch) {
        try {
          emitToRoom(`user:${u.id}`, 'notification:received', {
            _id: `broadcast_${broadcast._id}_${u.id}`,
            userId: u.id,
            title: title.trim(),
            message: body.trim(),
            type: 'broadcast',
            read: false,
            broadcastId: broadcast._id,
            createdAt: new Date().toISOString(),
          });
        } catch { /* ignora erros individuais de socket */ }
      }
    }

    await updateBroadcastById(broadcast._id, { deliveryCount: totalCreated });

    logger.info('Broadcast enviado', { broadcastId: broadcast._id, totalCreated });
    return res.status(201).json({ ...broadcast, deliveryCount: totalCreated });
  } catch (err) {
    logger.error('Erro ao criar broadcast', err as Error);
    return res.status(500).json({ error: 'Erro ao criar broadcast' });
  }
};

// Deletar broadcast e remover notificações de todos os usuários
export const deleteBroadcast = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const broadcast = await findBroadcastById(id);
    if (!broadcast) return res.status(404).json({ error: 'Broadcast não encontrado' });

    // Remove todas as notificações vinculadas
    const deletedCount = await deleteNotificationsByBroadcast(id);
    await removeBroadcast(id);

    logger.info('Broadcast deletado', { broadcastId: id, notificationsRemoved: deletedCount });
    return res.json({ success: true, notificationsRemoved: deletedCount });
  } catch (err) {
    logger.error('Erro ao deletar broadcast', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// Listar broadcasts enviados
export const listBroadcasts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = 20;
    const broadcasts = await listBroadcastsWithCreator((page - 1) * limit, limit);
    const total = await countBroadcasts();
    return res.json({ broadcasts, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error('Erro ao listar broadcasts', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
