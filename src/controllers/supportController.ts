import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import Conversation from '../models/Conversation';
import SupportTicket from '../models/SupportTicket';
import User from '../models/User';
import { emitToRoom, emitAdminNotification } from '../utils/socketEmitter';
import logger from '../config/logger';

// Mapeamento de role para gerente responsável e categoria
const ROLE_TO_CATEGORY: Record<string, 'clientes' | 'lojistas' | 'motoboys' | 'geral'> = {
  cliente: 'clientes',
  lojista: 'lojistas',
  motoboy: 'motoboys',
};

const CATEGORY_TO_MANAGER_ROLE: Record<string, string> = {
  clientes: 'gerente_clientes',
  lojistas: 'gerente_lojistas',
  motoboys: 'gerente_motoboys',
  geral: 'gerente_geral',
};

// Abrir ticket de suporte
export const openTicket = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const activeRole = (req.user as any)?.activeRole || req.user?.role;

    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    const { subject, category: requestedCategory } = req.body;
    if (!subject?.trim()) return res.status(400).json({ error: 'Assunto é obrigatório' });

    const user = await User.findById(userId).select('name');
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const category: 'clientes' | 'lojistas' | 'motoboys' | 'geral' =
      requestedCategory || ROLE_TO_CATEGORY[activeRole] || 'geral';

    const managerRole = CATEGORY_TO_MANAGER_ROLE[category];

    // Buscar um gerente disponível para atribuir
    const manager = await User.findOne({
      $or: [{ role: managerRole }, { roles: managerRole }],
    }).select('_id name');

    // Se não há gerente disponível, criar ticket sem atribuição
    if (!manager) {
      logger.warn('Nenhum gerente disponível para ticket de suporte', { category, userId });
    }

    // Cria a conversa de suporte
    const conversation = await Conversation.create({
      type: 'suporte',
      supportCategory: category,
      supportStatus: manager ? 'aberto' : 'aberto',
      participant1: {
        userId,
        role: activeRole === 'lojista' ? 'loja' : activeRole === 'motoboy' ? 'motoboy' : 'cliente',
        name: user.name,
      },
      participant2: {
        userId: manager?._id ?? userId,
        role: 'gerente',
        name: manager?.name ?? 'Suporte DROP',
      },
      isActive: true,
      messageCount: 0,
      unreadCount: [0, 0],
      isBlocked: [false, false],
      isMuted: [false, false],
    });

    // Cria o ticket
    const ticket = await SupportTicket.create({
      conversationId: conversation._id,
      openedBy: { userId, role: activeRole, name: user.name },
      assignedTo: manager ? [{ userId: manager._id, name: manager.name }] : [],
      category,
      subject: subject.trim(),
      status: 'aberto',
    });

    // Notifica a sala de gerentes via socket
    try {
      emitToRoom(`admin:${managerRole}`, 'support:new_ticket', {
        ticketId: ticket._id,
        conversationId: conversation._id,
        subject: ticket.subject,
        category,
        openedBy: { userId, name: user.name, role: activeRole },
      });
      emitAdminNotification({
        title: 'Novo ticket de suporte',
        body: `${user.name}: ${ticket.subject}`,
        url: '/admin/suporte',
        tag: 'support',
      });
    } catch (err) {
      logger.warn('Falha ao emitir evento de novo ticket', { ticketId: ticket._id });
    }

    return res.status(201).json({ ticket, conversationId: conversation._id });
  } catch (err) {
    logger.error('Erro ao abrir ticket de suporte', err as Error);
    return res.status(500).json({ error: 'Erro ao abrir ticket' });
  }
};

// Listar tickets
// Gerentes veem os da sua categoria; CEO vê todos
export const listTickets = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const activeRole = (req.user as any)?.activeRole || req.user?.role;

    let query: any = {};

    if (activeRole === 'ceo' || activeRole === 'gerente_geral') {
      // vê tudo, com filtros opcionais
      if (req.query.category) query.category = req.query.category;
      if (req.query.status) query.status = req.query.status;
    } else if (activeRole?.startsWith('gerente_')) {
      const suffix = activeRole.replace('gerente_', '');
      query.category = suffix;
    } else {
      // usuário comum vê apenas os próprios tickets
      query['openedBy.userId'] = userId;
    }

    const tickets = await SupportTicket.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json(tickets);
  } catch (err) {
    logger.error('Erro ao listar tickets', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// Gerente assume o ticket
export const assignTicket = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const activeRole = (req.user as any)?.activeRole || req.user?.role;

    const ticket = await SupportTicket.findById(id);
    if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });

    // Verificar se o gerente tem permissão para esta categoria de ticket
    if (activeRole !== 'ceo' && activeRole !== 'gerente_geral') {
      const categoryForRole: Record<string, string> = {
        gerente_clientes: 'clientes',
        gerente_lojistas: 'lojistas',
        gerente_motoboys: 'motoboys',
      };
      if (categoryForRole[activeRole] !== ticket.category) {
        return res.status(403).json({ error: 'Você não pode assumir tickets de outra categoria' });
      }
    }

    const user = await User.findById(userId).select('name').lean();
    const adminName = (user as any)?.name || 'Admin';

    const alreadyAssigned = ticket.assignedTo.some(a => a.userId.toString() === userId);
    if (!alreadyAssigned) {
      ticket.assignedTo.push({ userId: userId as any, name: adminName });
    }
    ticket.status = 'em_atendimento';
    await ticket.save();

    // Atualiza status na conversa também
    await Conversation.findByIdAndUpdate(ticket.conversationId, { supportStatus: 'em_atendimento' });

    return res.json({ success: true, ticket });
  } catch (err) {
    logger.error('Erro ao assumir ticket', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// Apagar ticket (apenas CEO)
export const deleteTicket = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const activeRole = (req.user as any)?.activeRole || req.user?.role;

    if (activeRole !== 'ceo') {
      return res.status(403).json({ error: 'Apenas o CEO pode apagar tickets' });
    }

    const ticket = await SupportTicket.findById(id);
    if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });

    await Conversation.findByIdAndDelete(ticket.conversationId);
    await ticket.deleteOne();

    return res.json({ success: true });
  } catch (err) {
    logger.error('Erro ao apagar ticket', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// Marcar ticket como resolvido
export const resolveTicket = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const activeRole = (req.user as any)?.activeRole || req.user?.role;

    const ticket = await SupportTicket.findById(id);
    if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });

    const adminRoles = ['ceo', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'];
    if (!adminRoles.includes(activeRole)) {
      return res.status(403).json({ error: 'Apenas a equipe de suporte pode finalizar atendimentos' });
    }

    // Gerentes específicos só podem resolver tickets da sua categoria
    if (activeRole !== 'ceo' && activeRole !== 'gerente_geral') {
      const categoryForRole: Record<string, string> = {
        gerente_clientes: 'clientes',
        gerente_lojistas: 'lojistas',
        gerente_motoboys: 'motoboys',
      };
      if (categoryForRole[activeRole] !== ticket.category) {
        return res.status(403).json({ error: 'Você não pode resolver tickets de outra categoria' });
      }
    }

    ticket.status = 'resolvido';
    ticket.resolvedAt = new Date();
    await ticket.save();

    const conv = await Conversation.findByIdAndUpdate(
      ticket.conversationId,
      { supportStatus: 'resolvido', isActive: false },
      { new: true }
    ).lean();

    // Notificar ambos os participantes em tempo real
    if (conv) {
      const p1Id = (conv as any).participant1?.userId?.toString();
      const p2Id = (conv as any).participant2?.userId?.toString();
      const payload = { ticketId: ticket._id, conversationId: ticket.conversationId };
      if (p1Id) emitToRoom(`user:${p1Id}`, 'support:ticket_resolved', payload);
      if (p2Id) emitToRoom(`user:${p2Id}`, 'support:ticket_resolved', payload);
    }

    return res.json({ success: true });
  } catch (err) {
    logger.error('Erro ao resolver ticket', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
