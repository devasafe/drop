import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import User from '../models/User';
import Store from '../models/Store';
import logger from '../config/logger';

type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';

function inferPixKeyType(key: string): PixKeyType {
  const digits = key.replace(/\D/g, '');
  if (key.includes('@')) return 'EMAIL';
  if (digits.length === 11 && key.replace(/\D/g, '') === key) return 'CPF';
  if (digits.length === 14) return 'CNPJ';
  if (digits.length >= 10 && digits.length <= 13) return 'PHONE';
  return 'EVP'; // chave aleatória
}

/**
 * POST /api/onboarding/pix-key
 * Salva a chave PIX de saque do recebedor (motoboy → User.asaas; lojista → Store.asaas).
 * Body: { pixKey, pixKeyType?, storeId? }
 */
export const setPixKey = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const role = (req.user as any)?.activeRole || req.user?.role;
    const { pixKey, pixKeyType, storeId } = req.body;

    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    if (!pixKey || typeof pixKey !== 'string' || !pixKey.trim()) {
      return res.status(400).json({ error: 'Chave PIX obrigatória' });
    }
    const valid: PixKeyType[] = ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'];
    const type: PixKeyType = valid.includes(pixKeyType) ? pixKeyType : inferPixKeyType(pixKey.trim());

    if (role === 'motoboy') {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
      if (!user.asaas) (user as any).asaas = { status: 'none' };
      user.asaas!.pixKey = pixKey.trim();
      user.asaas!.pixKeyType = type;
      user.markModified('asaas');
      await user.save();
      return res.json({ ok: true, target: 'motoboy', pixKeyType: type });
    }

    if (role === 'lojista' || (role as string) === 'seller') {
      const store = storeId
        ? await Store.findOne({ _id: storeId, ownerId: userId })
        : await Store.findOne({ ownerId: userId });
      if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
      if (!store.asaas) (store as any).asaas = { status: 'none' };
      store.asaas!.pixKey = pixKey.trim();
      store.asaas!.pixKeyType = type;
      store.markModified('asaas');
      await store.save();
      return res.json({ ok: true, target: 'store', pixKeyType: type });
    }

    return res.status(403).json({ error: 'Apenas motoboys e lojistas configuram chave PIX' });
  } catch (err) {
    logger.error('Erro ao salvar chave PIX', err as Error);
    return res.status(500).json({ error: 'Erro ao salvar chave PIX' });
  }
};

/**
 * GET /api/onboarding/status
 * Retorna o estado da subconta e se a chave PIX já foi configurada.
 */
export const getOnboardingStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const role = (req.user as any)?.activeRole || req.user?.role;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    if (role === 'motoboy') {
      const user = await User.findById(userId).select('asaas');
      return res.json({
        target: 'motoboy',
        accountStatus: user?.asaas?.status || 'none',
        hasPixKey: !!user?.asaas?.pixKey,
        lastError: user?.asaas?.lastError,
      });
    }
    if (role === 'lojista' || (role as string) === 'seller') {
      const store = await Store.findOne({ ownerId: userId }).select('asaas');
      return res.json({
        target: 'store',
        accountStatus: store?.asaas?.status || 'none',
        hasPixKey: !!store?.asaas?.pixKey,
        lastError: store?.asaas?.lastError,
      });
    }
    return res.json({ target: 'none', accountStatus: 'none', hasPixKey: false });
  } catch (err) {
    logger.error('Erro ao obter status de onboarding', err as Error);
    return res.status(500).json({ error: 'Erro ao obter status' });
  }
};
