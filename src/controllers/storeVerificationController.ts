import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import User from '../models/User';
import Store from '../models/Store';
import { uploadToCloudinary } from '../utils/cloudinary';
import { isValidCNPJ, onlyDigits } from '../utils/documentValidation';
import { consultarCNPJ } from '../services/cnpjLookup';
import {
  missingStoreVerifications,
  recomputeStoreVerification,
  recomputeStoresForOwner,
} from '../utils/storeVerification';
import logger from '../config/logger';
import { emitAdminNotification } from '../utils/socketEmitter';

const ensureUserVerification = (u: any) => {
  if (!u.verification) u.verification = { email: { status: 'pending' }, phone: { status: 'pending' }, document: { status: 'none' } };
  if (!u.verification.facial) u.verification.facial = { status: 'none' };
};
const ensureStoreVerification = (s: any) => {
  if (!s.verification) s.verification = { cnpj: { status: 'none' }, address: { status: 'none' } };
};

async function assertStoreOwner(storeId: string, userId?: string): Promise<{ store: any | null; code: number }> {
  const store = await Store.findById(storeId);
  if (!store) return { store: null, code: 404 };
  if (String(store.ownerId) !== String(userId)) return { store: null, code: 403 };
  return { store, code: 200 };
}

// ===================== FACIAL (dono) =====================
export const submitFacial = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const file = (req.file as any) || (req.files as any)?.selfie?.[0];
    if (!file) return res.status(400).json({ error: 'Envie a selfie' });
    const user = await User.findById(req.user?.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    ensureUserVerification(user);
    if (user.verification!.facial!.status === 'pending') return res.status(409).json({ error: 'Selfie já em análise' });
    if (user.verification!.facial!.status === 'approved') return res.status(409).json({ error: 'Facial já aprovada' });

    const selfieUrl = await uploadToCloudinary(file.buffer, `verifications/${user.id}/facial`);
    user.verification!.facial = { status: 'pending', selfieUrl, submittedAt: new Date() };
    user.markModified('verification');
    await user.save();
    emitAdminNotification({
      title: 'Nova verificação pendente',
      body: `${user.name} enviou uma selfie (facial) para análise.`,
      url: '/admin/verificacoes',
      tag: 'verification',
    });
    return res.json({ message: 'Selfie enviada para análise', status: 'pending' });
  } catch (err) {
    logger.error('Erro ao enviar facial', err as Error);
    return res.status(500).json({ error: 'Erro ao enviar selfie' });
  }
};

// ===================== CNPJ (loja) =====================
export const submitStoreCnpj = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { storeId } = req.params;

    const owned = await assertStoreOwner(storeId, req.user?.id);
    if (owned.code === 404) return res.status(404).json({ error: 'Loja não encontrada' });
    if (owned.code === 403) return res.status(403).json({ error: 'Apenas o dono da loja pode enviar' });
    const store = owned.store;
    ensureStoreVerification(store);

    // O CNPJ verificado é SEMPRE o do cadastro da loja (editar-conta), nunca digitado aqui.
    // Garante que o CNPJ aprovado e o salvo no cadastro da loja nunca divirjam.
    const cnpj = store.cnpj;
    if (!cnpj) {
      return res.status(400).json({ error: 'Cadastre o CNPJ da loja em "Editar meus dados" antes de enviar para verificação' });
    }
    if (!isValidCNPJ(cnpj)) {
      return res.status(400).json({ error: 'O CNPJ cadastrado é inválido. Corrija em "Editar meus dados".' });
    }

    const lookup = await consultarCNPJ(cnpj);
    store.verification!.cnpj = {
      status: 'pending',
      number: onlyDigits(cnpj),
      razaoSocial: lookup?.razaoSocial,
      situacao: lookup?.situacao,
    };
    store.markModified('verification');
    await store.save();
    emitAdminNotification({
      title: 'Nova verificação pendente',
      body: `Loja "${store.name}" enviou o CNPJ para análise.`,
      url: '/admin/verificacoes',
      tag: 'verification',
    });
    return res.json({ message: 'CNPJ enviado para análise', lookup, status: 'pending' });
  } catch (err) {
    logger.error('Erro ao enviar CNPJ', err as Error);
    return res.status(500).json({ error: 'Erro ao enviar CNPJ' });
  }
};

// ===================== ENDEREÇO (loja) =====================
export const submitStoreAddress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const file = (req.file as any) || (req.files as any)?.comprovante?.[0];
    if (!file) return res.status(400).json({ error: 'Envie o comprovante de endereço' });

    const owned = await assertStoreOwner(storeId, req.user?.id);
    if (owned.code === 404) return res.status(404).json({ error: 'Loja não encontrada' });
    if (owned.code === 403) return res.status(403).json({ error: 'Apenas o dono da loja pode enviar' });
    const store = owned.store;
    ensureStoreVerification(store);

    const comprovanteUrl = await uploadToCloudinary(file.buffer, `verifications/store/${storeId}/address`);
    store.verification!.address = { status: 'pending', comprovanteUrl, submittedAt: new Date() };
    store.markModified('verification');
    await store.save();
    emitAdminNotification({
      title: 'Nova verificação pendente',
      body: `Loja "${store.name}" enviou o comprovante de endereço para análise.`,
      url: '/admin/verificacoes',
      tag: 'verification',
    });
    return res.json({ message: 'Comprovante enviado para análise', status: 'pending' });
  } catch (err) {
    logger.error('Erro ao enviar comprovante', err as Error);
    return res.status(500).json({ error: 'Erro ao enviar comprovante' });
  }
};

// ===================== STATUS =====================
export const getStoreVerification = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const store = await Store.findById(storeId);
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
    const owner = await User.findById(store.ownerId).select('verification');

    const role = (req.user as any)?.activeRole || (req.user as any)?.role;
    const isOwner = String(store.ownerId) === String(req.user?.id);
    const isAdmin = ['ceo', 'gerente_geral', 'gerente_lojistas'].includes(role);
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Sem permissão' });

    return res.json({
      isVerified: store.isVerified === true,
      missing: missingStoreVerifications(store, owner),
      facial: owner?.verification?.facial || { status: 'none' },
      cnpj: store.verification?.cnpj || { status: 'none' },
      address: store.verification?.address || { status: 'none' },
    });
  } catch (err) {
    logger.error('Erro ao obter verificação da loja', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ===================== ADMIN =====================
export const listPendingStoreVerifications = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const stores = await Store.find({
      $or: [
        { 'verification.cnpj.status': 'pending' },
        { 'verification.address.status': 'pending' },
      ],
    })
      .select('name ownerId verification isVerified')
      .populate('ownerId', 'name email roles role')
      .lean();

    const facialPendingOwners = await User.find({ 'verification.facial.status': 'pending' })
      .select('name email roles role verification.facial').lean();

    return res.json({ stores, facialPendingOwners });
  } catch (err) {
    logger.error('Erro ao listar verificações de loja', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

async function decideUserFacial(req: AuthenticatedRequest, res: Response, approved: boolean) {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  ensureUserVerification(user);
  if (user.verification!.facial!.status !== 'pending') return res.status(400).json({ error: 'Facial não está pendente' });
  user.verification!.facial!.status = approved ? 'approved' : 'rejected';
  user.verification!.facial!.reviewedBy = req.user?.id;
  user.verification!.facial!.reviewedAt = new Date();
  user.verification!.facial!.rejectionReason = approved ? undefined : (req.body?.reason || 'Selfie não aprovada');
  user.markModified('verification');
  await user.save();
  await recomputeStoresForOwner(userId);
  logger.info(`[verification][AUDIT] facial ${approved ? 'aprovada' : 'rejeitada'}`, { userId, by: req.user?.id });
  return res.json({ message: approved ? 'Facial aprovada' : 'Facial rejeitada' });
}
export const approveFacial = (req: AuthenticatedRequest, res: Response) => decideUserFacial(req, res, true);
export const rejectFacial = (req: AuthenticatedRequest, res: Response) => decideUserFacial(req, res, false);

async function decideStoreItem(req: AuthenticatedRequest, res: Response, item: 'cnpj' | 'address', approved: boolean) {
  const { storeId } = req.params;
  const store = await Store.findById(storeId);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  ensureStoreVerification(store);
  if (store.verification![item].status !== 'pending') return res.status(400).json({ error: `${item} não está pendente` });
  store.verification![item].status = approved ? 'approved' : 'rejected';
  store.verification![item].reviewedBy = req.user?.id;
  store.verification![item].reviewedAt = new Date();
  store.verification![item].rejectionReason = approved ? undefined : (req.body?.reason || 'Não aprovado');
  store.markModified('verification');
  await store.save();
  await recomputeStoreVerification(storeId);
  logger.info(`[verification][AUDIT] ${item} da loja ${approved ? 'aprovado' : 'rejeitado'}`, { storeId, by: req.user?.id });
  return res.json({ message: `${item} ${approved ? 'aprovado' : 'rejeitado'}` });
}
export const approveStoreCnpj = (req: AuthenticatedRequest, res: Response) => decideStoreItem(req, res, 'cnpj', true);
export const rejectStoreCnpj = (req: AuthenticatedRequest, res: Response) => decideStoreItem(req, res, 'cnpj', false);
export const approveStoreAddress = (req: AuthenticatedRequest, res: Response) => decideStoreItem(req, res, 'address', true);
export const rejectStoreAddress = (req: AuthenticatedRequest, res: Response) => decideStoreItem(req, res, 'address', false);
