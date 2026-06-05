import { Response } from 'express';
import { Types } from 'mongoose';
import { AuthenticatedRequest } from '../types';
import WalletAccessRequest from '../models/WalletAccessRequest';
import User from '../models/User';
import { emitToRoom } from '../utils/socketEmitter';
import logger from '../config/logger';

const ACCESS_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Verifica se existe acesso aprovado e válido (não expirado) entre um requester e um target.
 * Marca como expired se passou do prazo.
 */
export async function hasValidWalletAccess(requestedById: string, targetUserId: string): Promise<boolean> {
  const now = new Date();
  const found = await WalletAccessRequest.findOne({
    requestedBy: requestedById,
    targetUserId,
    status: 'approved',
  }).sort({ approvedAt: -1 });

  if (!found) return false;
  if (!found.expiresAt || found.expiresAt.getTime() <= now.getTime()) {
    found.status = 'expired';
    await found.save();
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
    if (!targetUserId || !Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ error: 'targetUserId inválido' });
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Justificativa (reason) é obrigatória (mín 5 caracteres)' });
    }

    const target = await User.findById(targetUserId).select('_id name');
    if (!target) return res.status(404).json({ error: 'Usuário alvo não encontrado' });

    // Não permitir pedir pra si mesmo
    if (String(target._id) === String(userId)) {
      return res.status(400).json({ error: 'Você já tem acesso à sua própria carteira' });
    }

    // Se já existe um pending pra essa dupla, retorna o existente
    const existingPending = await WalletAccessRequest.findOne({
      requestedBy: userId,
      targetUserId,
      status: 'pending',
    });
    if (existingPending) {
      return res.json({ request: existingPending, alreadyExists: true });
    }

    const request = await WalletAccessRequest.create({
      requestedBy: userId,
      requestedByRole: userRole,
      targetUserId,
      reason: reason.trim(),
      status: 'pending',
    });

    // Notifica o cliente alvo
    const populated = await request.populate('requestedBy', 'name email');
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
    const request = await WalletAccessRequest.findById(id);
    if (!request) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (String(request.targetUserId) !== String(userId)) {
      return res.status(403).json({ error: 'Apenas o dono da carteira pode aprovar' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Solicitação já está ${request.status}` });
    }

    request.status = 'approved';
    request.approvedAt = new Date();
    request.expiresAt = new Date(Date.now() + ACCESS_WINDOW_MS);
    await request.save();

    emitToRoom(`user:${request.requestedBy}`, 'wallet:access_approved', request);

    return res.json({ request });
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
    const request = await WalletAccessRequest.findById(id);
    if (!request) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (String(request.targetUserId) !== String(userId)) {
      return res.status(403).json({ error: 'Apenas o dono da carteira pode rejeitar' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Solicitação já está ${request.status}` });
    }
    request.status = 'rejected';
    request.rejectedAt = new Date();
    await request.save();

    emitToRoom(`user:${request.requestedBy}`, 'wallet:access_rejected', request);
    return res.json({ request });
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
    const request = await WalletAccessRequest.findById(id);
    if (!request) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (String(request.targetUserId) !== String(userId)) {
      return res.status(403).json({ error: 'Apenas o dono da carteira pode revogar' });
    }
    if (request.status !== 'approved') {
      return res.status(400).json({ error: 'Apenas acessos aprovados podem ser revogados' });
    }
    request.status = 'revoked';
    request.revokedAt = new Date();
    await request.save();

    emitToRoom(`user:${request.requestedBy}`, 'wallet:access_revoked', request);
    return res.json({ request });
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
    const requests = await WalletAccessRequest.find({ targetUserId: userId })
      .sort({ createdAt: -1 })
      .populate('requestedBy', 'name email')
      .limit(100);
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
    const requests = await WalletAccessRequest.find({ requestedBy: userId })
      .sort({ createdAt: -1 })
      .populate('targetUserId', 'name email')
      .limit(200);

    // Marcar expirados em batch
    const now = Date.now();
    const updates: Promise<any>[] = [];
    for (const r of requests) {
      if (r.status === 'approved' && r.expiresAt && r.expiresAt.getTime() <= now) {
        r.status = 'expired';
        updates.push(r.save());
      }
    }
    await Promise.all(updates);

    return res.json({ requests });
  } catch (err) {
    logger.error('Erro ao listar outgoing', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
