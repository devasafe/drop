import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import Notification from '../models/Notification';

// Lista notificações do usuário autenticado
export const listNotifications = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const notifications = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(100);
    return res.json(notifications);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao listar notificações' });
  }
};

// Marcar como lida
export const markNotificationRead = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const notif = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { read: true },
      { new: true }
    );
    if (!notif) return res.status(404).json({ error: 'Notificação não encontrada' });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// Deletar notificação
export const deleteNotification = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const notif = await Notification.findOneAndDelete({ _id: id, userId });
    if (!notif) return res.status(404).json({ error: 'Notificação não encontrada' });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// Marcar todas como lidas
export const markAllRead = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    await Notification.updateMany({ userId, read: false }, { read: true });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
