import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import User from '../models/User';
import Store from '../models/Store';
import logger from '../config/logger';
import { ensureStoreSubaccount, ensureMotoboySubaccount } from '../services/asaas/subaccount';

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
 * Estado da subconta: status, se tem PIX, se tem endereço, e a chave atual.
 */
export const getOnboardingStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const role = (req.user as any)?.activeRole || req.user?.role;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    if (role === 'motoboy') {
      const user = await User.findById(userId).select('asaas addresses');
      const hasAddress = !!(user?.addresses && user.addresses.length > 0);
      return res.json({
        target: 'motoboy',
        accountStatus: user?.asaas?.status || 'none',
        hasPixKey: !!user?.asaas?.pixKey,
        pixKey: user?.asaas?.pixKey,
        hasAddress,
        lastError: user?.asaas?.lastError,
      });
    }
    if (role === 'lojista' || (role as string) === 'seller') {
      const store = await Store.findOne({ ownerId: userId }).select('asaas street');
      const hasAddress = !!store?.street;
      return res.json({
        target: 'store',
        accountStatus: store?.asaas?.status || 'none',
        hasPixKey: !!store?.asaas?.pixKey,
        pixKey: store?.asaas?.pixKey,
        hasAddress,
        lastError: store?.asaas?.lastError,
      });
    }
    return res.json({ target: 'none', accountStatus: 'none', hasPixKey: false, hasAddress: false });
  } catch (err) {
    logger.error('Erro ao obter status de onboarding', err as Error);
    return res.status(500).json({ error: 'Erro ao obter status' });
  }
};

/**
 * POST /api/onboarding/receiver  (self-service do recebedor)
 * Salva endereço (se enviado) + chave PIX e CRIA a subconta Asaas.
 * Body: { pixKey, pixKeyType?, address?:{ street, number, neighborhood, city, state, zip } }
 */
export const setupReceiver = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const role = (req.user as any)?.activeRole || req.user?.role;
    const { pixKey, pixKeyType, address } = req.body;

    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    if (!pixKey || typeof pixKey !== 'string' || !pixKey.trim()) {
      return res.status(400).json({ error: 'Chave PIX obrigatória' });
    }
    const valid: PixKeyType[] = ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'];
    const type: PixKeyType = valid.includes(pixKeyType) ? pixKeyType : inferPixKeyType(pixKey.trim());

    const fmt = (a: any) => ({ status: a?.status || 'none', hasWallet: !!a?.walletId, hasPix: !!a?.pixKey, lastError: a?.lastError });

    if (role === 'motoboy') {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

      if (address?.street && !(user.addresses && user.addresses.length)) {
        user.addresses = user.addresses || [];
        user.addresses.push({
          street: address.street, number: address.number || 'S/N', neighborhood: address.neighborhood || 'Centro',
          city: address.city || '', state: address.state || '', cep: (address.zip || address.cep || '').replace(/\D/g, ''),
          latitude: '0', longitude: '0', isDefault: true,
        } as any);
      }
      if (!user.asaas) (user as any).asaas = { status: 'none' };
      user.asaas!.pixKey = pixKey.trim();
      user.asaas!.pixKeyType = type;
      user.markModified('asaas');
      await user.save();

      await ensureMotoboySubaccount(String(user._id));
      const fresh = await User.findById(user._id).select('asaas');
      return res.json({ ok: true, target: 'motoboy', asaas: fmt(fresh?.asaas) });
    }

    if (role === 'lojista' || (role as string) === 'seller') {
      const store = await Store.findOne({ ownerId: userId });
      if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

      if (address) {
        if (address.street) store.street = address.street;
        if (address.number) store.number = address.number;
        if (address.neighborhood) store.neighborhood = address.neighborhood;
        if (address.city) store.city = address.city;
        if (address.state) store.state = address.state;
        if (address.zip || address.cep) store.zip = (address.zip || address.cep).replace(/\D/g, '');
      }
      if (!store.asaas) (store as any).asaas = { status: 'none' };
      store.asaas!.pixKey = pixKey.trim();
      store.asaas!.pixKeyType = type;
      store.markModified('asaas');
      await store.save();

      await ensureStoreSubaccount(String(store._id));
      const fresh = await Store.findById(store._id).select('asaas');
      return res.json({ ok: true, target: 'store', asaas: fmt(fresh?.asaas) });
    }

    return res.status(403).json({ error: 'Apenas motoboys e lojistas configuram recebimento' });
  } catch (err) {
    logger.error('Erro no setup de recebedor', err as Error);
    return res.status(500).json({ error: 'Erro ao configurar recebimento' });
  }
};
