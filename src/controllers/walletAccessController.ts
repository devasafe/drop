import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';
import userRepository from '../repositories/user.repository';
import { emitToRoom } from '../utils/socketEmitter';
import logger from '../config/logger';

const ACCESS_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

const toApi = (r: any) => (r ? { ...r, _id: r.id } : r);

/**
 * Anexa {_id, name, email} do usuário referenciado por `field` a cada registro
 * (equivale ao `.populate(field, 'name email')` do Mongoose). Substitui o valor
 * do campo pelo objeto do usuário.
 */
async function populateUsers(records: any[], field: string): Promise<any[]> {
  const ids = [...new Set(records.map((r) => r[field]).filter(Boolean))].map(String);
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })
    : [];
  const byId = new Map(users.map((u) => [String(u.id), { _id: u.id, name: u.name, email: u.email }]));
  return records.map((r) => ({ ...toApi(r), [field]: r[field] ? byId.get(String(r[field])) ?? r[field] : r[field] }));
}

/**
 * Verifica se existe acesso aprovado e válido (não expirado) entre um requester e um target.
 * Marca como expired se passou do prazo.
 */
export async function hasValidWalletAccess(requestedById: string, targetUserId: string): Promise<boolean> {
  const now = new Date();
  const found = await prisma.walletAccessRequest.findFirst({
    where: { requestedBy: String(requestedById), targetUserId: String(targetUserId), status: 'approved' },
    orderBy: { approvedAt: 'desc' },
  });

  if (!found) return false;
  if (!found.expiresAt || found.expiresAt.getTime() <= now.getTime()) {
    await prisma.walletAccessRequest.update({ where: { id: found.id }, data: { status: 'expired' } });
    return false;
  }
  return true;
}

/**
 * POST /wallet-access/request
 * Cliente alvo é notificado via socket.
 */
export const requestWalletAccess = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userRole = (req.user as any)?.activeRole || (req.user as any)?.role;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    const { targetUserId, reason } = req.body || {};
    if (!targetUserId || typeof targetUserId !== 'string' || !targetUserId.trim()) {
      return res.status(400).json({ error: 'targetUserId inválido' });
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Justificativa (reason) é obrigatória (mín 5 caracteres)' });
    }

    const target = await userRepository.findById(String(targetUserId)) as any;
    if (!target) return res.status(404).json({ error: 'Usuário alvo não encontrado' });

    // Não permitir pedir pra si mesmo
    if (String(target.id) === String(userId)) {
      return res.status(400).json({ error: 'Você já tem acesso à sua própria carteira' });
    }

    // Se já existe um pending pra essa dupla, retorna o existente
    const existingPending = await prisma.walletAccessRequest.findFirst({
      where: { requestedBy: String(userId), targetUserId: String(targetUserId), status: 'pending' },
    });
    if (existingPending) {
      return res.json({ request: toApi(existingPending), alreadyExists: true });
    }

    const request = await prisma.walletAccessRequest.create({
      data: {
        requestedBy: String(userId),
        requestedByRole: userRole as any,
        targetUserId: String(targetUserId),
        reason: reason.trim(),
        status: 'pending',
      },
    });

    // Notifica o cliente alvo (com o requester populado)
    const [populated] = await populateUsers([request], 'requestedBy');
    emitToRoom(`user:${targetUserId}`, 'wallet:access_requested', populated);

    return res.status(201).json({ request: populated });
  } catch (err) {
    logger.error('Erro ao solicitar acesso à carteira', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

/**
 * POST /wallet-access/:id/approve — só o targetUserId pode aprovar.
 */
export const approveWalletAccess = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const request = await prisma.walletAccessRequest.findUnique({ where: { id: String(id) } });
    if (!request) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (String(request.targetUserId) !== String(userId)) {
      return res.status(403).json({ error: 'Apenas o dono da carteira pode aprovar' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Solicitação já está ${request.status}` });
    }

    const updated = await prisma.walletAccessRequest.update({
      where: { id: request.id },
      data: { status: 'approved', approvedAt: new Date(), expiresAt: new Date(Date.now() + ACCESS_WINDOW_MS) },
    });

    emitToRoom(`user:${updated.requestedBy}`, 'wallet:access_approved', toApi(updated));

    return res.json({ request: toApi(updated) });
  } catch (err) {
    logger.error('Erro ao aprovar acesso', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

/**
 * POST /wallet-access/:id/reject
 */
export const rejectWalletAccess = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const request = await prisma.walletAccessRequest.findUnique({ where: { id: String(id) } });
    if (!request) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (String(request.targetUserId) !== String(userId)) {
      return res.status(403).json({ error: 'Apenas o dono da carteira pode rejeitar' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Solicitação já está ${request.status}` });
    }
    const updated = await prisma.walletAccessRequest.update({
      where: { id: request.id },
      data: { status: 'rejected', rejectedAt: new Date() },
    });

    emitToRoom(`user:${updated.requestedBy}`, 'wallet:access_rejected', toApi(updated));
    return res.json({ request: toApi(updated) });
  } catch (err) {
    logger.error('Erro ao rejeitar acesso', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

/**
 * POST /wallet-access/:id/revoke — targetUserId pode revogar acesso já aprovado antes de expirar.
 */
export const revokeWalletAccess = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const request = await prisma.walletAccessRequest.findUnique({ where: { id: String(id) } });
    if (!request) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (String(request.targetUserId) !== String(userId)) {
      return res.status(403).json({ error: 'Apenas o dono da carteira pode revogar' });
    }
    if (request.status !== 'approved') {
      return res.status(400).json({ error: 'Apenas acessos aprovados podem ser revogados' });
    }
    const updated = await prisma.walletAccessRequest.update({
      where: { id: request.id },
      data: { status: 'revoked', revokedAt: new Date() },
    });

    emitToRoom(`user:${updated.requestedBy}`, 'wallet:access_revoked', toApi(updated));
    return res.json({ request: toApi(updated) });
  } catch (err) {
    logger.error('Erro ao revogar acesso', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

/**
 * GET /wallet-access/incoming — quem pediu pra ver MINHA carteira (inbox do cliente).
 */
export const listIncomingRequests = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const rows = await prisma.walletAccessRequest.findMany({
      where: { targetUserId: String(userId) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const requests = await populateUsers(rows, 'requestedBy');
    return res.json({ requests });
  } catch (err) {
    logger.error('Erro ao listar incoming', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

/**
 * GET /wallet-access/outgoing — pedidos que EU fiz, pra ver carteira de outros.
 */
export const listOutgoingRequests = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const rows = await prisma.walletAccessRequest.findMany({
      where: { requestedBy: String(userId) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Marcar expirados em batch
    const now = Date.now();
    const expiredIds = rows
      .filter((r) => r.status === 'approved' && r.expiresAt && r.expiresAt.getTime() <= now)
      .map((r) => r.id);
    if (expiredIds.length) {
      await prisma.walletAccessRequest.updateMany({ where: { id: { in: expiredIds } }, data: { status: 'expired' } });
      for (const r of rows) if (expiredIds.includes(r.id)) (r as any).status = 'expired';
    }

    const requests = await populateUsers(rows, 'targetUserId');
    return res.json({ requests });
  } catch (err) {
    logger.error('Erro ao listar outgoing', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
