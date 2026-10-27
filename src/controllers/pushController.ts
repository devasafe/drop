import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';
import { FCM_ENDPOINT_PREFIX, getVapidPublicKey, isFcmEnabled, isPushEnabled, sendPushToUser } from '../services/pushService';

// Chave pública VAPID (o front precisa dela pra criar a inscrição). Pública por natureza.
export const vapidPublicKey = (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ publicKey: getVapidPublicKey(), enabled: isPushEnabled() });
};

// Token do Firebase: base64url com ':' e '-' (~160 caracteres). Limite folgado só contra lixo.
const FCM_TOKEN_RE = /^[A-Za-z0-9_:\-]{20,4096}$/;

// Salva/atualiza a inscrição de push do device do usuário logado.
// Navegador: { endpoint, keys: { p256dh, auth } }. App Android: { platform: 'fcm', token }.
export const subscribe = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 300);
    const body = (req.body || {}) as { platform?: string; token?: string; endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (body.platform === 'fcm') {
      if (typeof body.token !== 'string' || !FCM_TOKEN_RE.test(body.token)) {
        return res.status(400).json({ error: 'Inscrição inválida' });
      }
      const endpoint = `${FCM_ENDPOINT_PREFIX}${body.token}`;
      await prisma.pushSubscription.upsert({
        where: { endpoint },
        create: { userId: req.user.id, endpoint, platform: 'fcm', userAgent },
        update: { userId: req.user.id, platform: 'fcm', userAgent },
      });
      return res.json({ ok: true, enabled: isFcmEnabled() });
    }
    const { endpoint, keys } = body;
    if (!endpoint || endpoint.startsWith(FCM_ENDPOINT_PREFIX) || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Inscrição inválida' });
    }
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

/** Texto e link do push de teste conforme o painel de quem ativou (papel ativo). */
const TEST_PUSH_BY_ROLE: Record<string, { body: string; url: string }> = {
  cliente: { body: 'É assim que você vai saber de cada etapa do seu pedido, mesmo com o app fechado.', url: '/pedidos' },
  motoboy: { body: 'É assim que você vai receber as corridas, mesmo com o celular bloqueado.', url: '/motoboy' },
  lojista: { body: 'É assim que você vai receber os pedidos da loja, mesmo com o app fechado.', url: '/seller/dashboard' },
};
for (const admin of ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys']) {
  TEST_PUSH_BY_ROLE[admin] = { body: 'É assim que você vai receber os alertas do painel, mesmo com o app fechado.', url: '/admin/dashboard' };
}

// Dispara um push de teste pro próprio usuário (botão "testar" na UI).
export const sendTest = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!isPushEnabled() && !isFcmEnabled()) return res.status(503).json({ error: 'Push não configurado no servidor' });
    const role = String((req.user as any).activeRole || req.user.role || 'cliente');
    const panel = TEST_PUSH_BY_ROLE[role] ?? TEST_PUSH_BY_ROLE.cliente;
    const payload = { title: 'Notificações ativadas ✅', body: panel.body, url: panel.url, tag: 'teste' };
    // Teste com o app fechado: a pessoa toca, fecha o app e o aviso chega depois (até 30 s).
    const delaySeconds = Math.min(Math.max(Math.floor(Number((req.body || {}).delaySeconds) || 0), 0), 30);
    if (delaySeconds > 0) {
      const userId = req.user.id;
      setTimeout(() => { sendPushToUser(userId, payload).catch(() => undefined); }, delaySeconds * 1000);
      return res.json({ ok: true, delaySeconds });
    }
    await sendPushToUser(req.user.id, payload);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[push] sendTest error:', err);
    return res.status(500).json({ error: 'Falha ao enviar teste' });
  }
};
