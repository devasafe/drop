import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { createConversation, updateConversation, deleteConversationById } from '../repositories/chat.repository';
import { prisma } from '../lib/prisma';
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

    const user = await prisma.user.findUnique({ where: { id: String(userId) }, select: { id: true, name: true } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const category: 'clientes' | 'lojistas' | 'motoboys' | 'geral' =
      requestedCategory || ROLE_TO_CATEGORY[activeRole] || 'geral';

    const managerRole = CATEGORY_TO_MANAGER_ROLE[category];

    // Buscar um gerente disponível para atribuir
    const manager = await prisma.user.findFirst({
      where: { OR: [{ role: managerRole as any }, { roles: { has: managerRole as any } }] },
      select: { id: true, name: true },
    });

    // Se não há gerente disponível, criar ticket sem atribuição
    if (!manager) {
      logger.warn('Nenhum gerente disponível para ticket de suporte', { category, userId });
    }

    // Cria a conversa de suporte
    const conversation = await createConversation({
      type: 'suporte',
      supportCategory: category,
      supportStatus: 'aberto',
      participant1: {
        userId,
        role: activeRole === 'lojista' ? 'loja' : activeRole === 'motoboy' ? 'motoboy' : 'cliente',
        name: user.name,
      },
      participant2: {
        userId: manager?.id ?? userId,
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
    const ticket = await prisma.supportTicket.create({
      data: {
        conversationId: conversation._id,
        openedBy: { userId, role: activeRole, name: user.name },
        assignedTo: manager ? [{ userId: manager.id, name: manager.name }] : [],
        category: category as any,
        subject: subject.trim(),
        status: 'aberto',
      },
    });

    // Notifica a sala de gerentes via socket
    try {
      emitToRoom(`admin:${managerRole}`, 'support:new_ticket', {
        ticketId: ticket.id,
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
      logger.warn('Falha ao emitir evento de novo ticket', { ticketId: ticket.id });
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

    let where: any = {};

    if (activeRole === 'ceo' || activeRole === 'gerente_geral') {
      // vê tudo, com filtros opcionais
      if (req.query.category) where.category = req.query.category as any;
      if (req.query.status) where.status = req.query.status as any;
    } else if (activeRole?.startsWith('gerente_')) {
      const suffix = activeRole.replace('gerente_', '');
      where.category = suffix as any;
    } else {
      // usuário comum vê apenas os próprios tickets (filtro JSON-path em openedBy.userId)
      where.openedBy = { path: ['userId'], equals: String(userId) };
    }

    const rows = await prisma.supportTicket.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    const tickets = rows.map((t) => ({ ...t, _id: t.id }));

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

    const ticket = await prisma.supportTicket.findUnique({ where: { id: String(id) } });
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

    const user = await prisma.user.findUnique({ where: { id: String(userId) }, select: { id: true, name: true } });
    const adminName = (user as any)?.name || 'Admin';

    const assignedTo = ((ticket.assignedTo as any[]) || []).slice();
    const alreadyAssigned = assignedTo.some((a: any) => String(a.userId) === String(userId));
    if (!alreadyAssigned) {
      assignedTo.push({ userId: String(userId), name: adminName });
    }
    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { assignedTo, status: 'em_atendimento' },
    });

    // Atualiza status na conversa também
    await updateConversation(ticket.conversationId, { supportStatus: 'em_atendimento' });

    return res.json({ success: true, ticket: { ...updated, _id: updated.id } });
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

    const ticket = await prisma.supportTicket.findUnique({ where: { id: String(id) } });
    if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });

    await deleteConversationById(ticket.conversationId);
    await prisma.supportTicket.delete({ where: { id: ticket.id } });

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

    const ticket = await prisma.supportTicket.findUnique({ where: { id: String(id) } });
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

    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: 'resolvido', resolvedAt: new Date() },
    });

    const conv = await updateConversation(ticket.conversationId, { supportStatus: 'resolvido', isActive: false });

    // Notificar ambos os participantes em tempo real
    if (conv) {
      const p1Id = (conv as any).participant1?.userId?.toString();
      const p2Id = (conv as any).participant2?.userId?.toString();
      const payload = { ticketId: ticket.id, conversationId: ticket.conversationId };
      if (p1Id) emitToRoom(`user:${p1Id}`, 'support:ticket_resolved', payload);
      if (p2Id) emitToRoom(`user:${p2Id}`, 'support:ticket_resolved', payload);
    }

    return res.json({ success: true });
  } catch (err) {
    logger.error('Erro ao resolver ticket', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
