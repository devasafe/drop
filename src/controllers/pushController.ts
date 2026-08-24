import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';
import { getVapidPublicKey, isPushEnabled, sendPushToUser } from '../services/pushService';

// Chave pública VAPID (o front precisa dela pra criar a inscrição). Pública por natureza.
export const vapidPublicKey = (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ publicKey: getVapidPublicKey(), enabled: isPushEnabled() });
};

// Salva/atualiza a inscrição de push do device do usuário logado.
export const subscribe = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    const { endpoint, keys } = (req.body || {}) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Inscrição inválida' });
    }
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 300);
    // endpoint é único → upsert reatribui o device ao usuário atual (troca de conta no mesmo navegador).
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
      update: { userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    });
    return res.json({ ok: true, enabled: isPushEnabled() });
  } catch (err) {
    console.error('[push] subscribe error:', err);
    return res.status(500).json({ error: 'Falha ao registrar notificações' });
  }
};

// Remove a inscrição (usuário desativou / logout).
export const unsubscribe = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    const endpoint = (req.body || {}).endpoint as string | undefined;
    if (!endpoint) return res.status(400).json({ error: 'endpoint obrigatório' });
    // só apaga se for do próprio usuário (evita remover device alheio)
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user.id } });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[push] unsubscribe error:', err);
    return res.status(500).json({ error: 'Falha ao remover notificações' });
  }
};

// Dispara um push de teste pro próprio usuário (botão "testar" na UI).
export const sendTest = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!isPushEnabled()) return res.status(503).json({ error: 'Push não configurado no servidor' });
    await sendPushToUser(req.user.id, {
      title: 'Notificações ativadas ✅',
      body: 'É assim que você vai receber as corridas, mesmo com o celular bloqueado.',
      url: '/motoboy',
      tag: 'teste',
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[push] sendTest error:', err);
    return res.status(500).json({ error: 'Falha ao enviar teste' });
  }
};
