import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import User from '../models/User';
import { uploadToCloudinary } from '../utils/cloudinary';
import { isValidCNH, isValidPlate, normalizePlate, onlyDigits } from '../utils/documentValidation';
import { missingMotoboyVerifications } from '../utils/courierVerification';
import logger from '../config/logger';
import { emitAdminNotification } from '../utils/socketEmitter';
import env from '../config/env';
import { ensureMotoboySubaccount } from '../services/asaas/subaccount';

const ensureV = (u: any) => {
  if (!u.verification) u.verification = { email: { status: 'pending' }, phone: { status: 'pending' }, document: { status: 'none' } };
  if (!u.verification.courier) u.verification.courier = { status: 'none' };
};

// POST /api/verification/motoboy (multipart platePhoto + cnhNumber + plate)
export const submitCourier = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cnhNumber, plate } = req.body;
    if (!isValidCNH(String(cnhNumber))) return res.status(400).json({ error: 'Número de CNH inválido' });
    if (!isValidPlate(String(plate))) return res.status(400).json({ error: 'Placa inválida' });

    const user = await User.findById(req.user?.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    ensureV(user);
    const cur: any = user.verification!.courier || { status: 'none' };
    const isFirst = !cur.cnhPhotoUrl && !cur.platePhotoUrl; // ainda não enviou nada

    const files = req.files as { platePhoto?: any[]; cnhPhoto?: any[] } | undefined;
    const plateFile = files?.platePhoto?.[0] || (req.file as any);
    const cnhFile = files?.cnhPhoto?.[0];
    // 1º envio: as duas fotos são obrigatórias. Reenvio (ex: só trocar a foto da
    // placa): manda só a que quer mudar — a outra é mantida.
    if (isFirst && !plateFile) return res.status(400).json({ error: 'Envie a foto da placa' });
    if (isFirst && !cnhFile) return res.status(400).json({ error: 'Envie a foto da CNH' });

    const cnhDigits = onlyDigits(String(cnhNumber));
    const plateNorm = normalizePlate(String(plate));

    // ✅ Placa e CNH não podem se repetir entre motoboys
    const dupPlate = await User.findOne({ _id: { $ne: user._id }, 'verification.courier.plate': plateNorm });
    if (dupPlate) return res.status(409).json({ error: 'Esta placa já está cadastrada em outro motoboy' });
    const dupCnh = await User.findOne({ _id: { $ne: user._id }, 'verification.courier.cnhNumber': cnhDigits });
    if (dupCnh) return res.status(409).json({ error: 'Esta CNH já está cadastrada em outro motoboy' });

    const folder = `verifications/${user.id}/courier`;
    const platePhotoUrl = plateFile ? await uploadToCloudinary(plateFile.buffer, folder) : cur.platePhotoUrl;
    const cnhPhotoUrl = cnhFile ? await uploadToCloudinary(cnhFile.buffer, folder) : cur.cnhPhotoUrl;
    user.verification!.courier = {
      status: 'pending',
      cnhNumber: cnhDigits,
      cnhPhotoUrl,
      plate: plateNorm,
      platePhotoUrl,
      submittedAt: new Date(),
    };
    user.markModified('verification');
    await user.save();
    emitAdminNotification({
      title: 'Nova verificação pendente',
      body: `${user.name} (motoboy) enviou CNH e placa para análise.`,
      url: '/admin/verificacoes',
      tag: 'verification',
    });
    return res.json({ message: 'Dados de motoboy enviados para análise', status: 'pending' });
  } catch (err) {
    logger.error('Erro ao enviar dados de motoboy', err as Error);
    return res.status(500).json({ error: 'Erro ao enviar dados' });
  }
};

// GET /api/verification/motoboy/me — status do motoboy
export const getMyCourierVerification = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await User.findById(req.user?.id).select('verification');
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    return res.json({
      missing: missingMotoboyVerifications(user),
      verified: missingMotoboyVerifications(user).length === 0,
      courier: user.verification?.courier || { status: 'none' },
      facial: user.verification?.facial || { status: 'none' },
    });
  } catch (err) {
    logger.error('Erro ao obter verificação do motoboy', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ===================== ADMIN =====================
export const listPendingCourier = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await User.find({ 'verification.courier.status': 'pending' })
      .select('name email roles role verification.courier verification.facial')
      .lean();
    return res.json({ count: users.length, items: users });
  } catch (err) {
    logger.error('Erro ao listar motoboys pendentes', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

async function decideCourier(req: AuthenticatedRequest, res: Response, approved: boolean) {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  ensureV(user);
  if (user.verification!.courier!.status !== 'pending') return res.status(400).json({ error: 'Dados não estão pendentes' });
  user.verification!.courier!.status = approved ? 'approved' : 'rejected';
  user.verification!.courier!.reviewedBy = req.user?.id;
  user.verification!.courier!.reviewedAt = new Date();
  user.verification!.courier!.rejectionReason = approved ? undefined : (req.body?.reason || 'Dados não aprovados');
  user.markModified('verification');
  await user.save();
  // Ao aprovar o motoboy, cria a subconta Asaas (gated — inerte até PAYMENT_GATEWAY=asaas).
  if (approved && env.PAYMENT_GATEWAY === 'asaas') {
    try {
      await ensureMotoboySubaccount(userId);
    } catch (err) {
      logger.error('Falha ao garantir subconta do motoboy na aprovação', err as Error, { userId });
    }
  }
  logger.info(`[verification][AUDIT] motoboy ${approved ? 'aprovado' : 'rejeitado'}`, { userId, by: req.user?.id });
  return res.json({ message: approved ? 'Motoboy aprovado' : 'Motoboy rejeitado' });
}
export const approveCourier = (req: AuthenticatedRequest, res: Response) => decideCourier(req, res, true);
export const rejectCourier = (req: AuthenticatedRequest, res: Response) => decideCourier(req, res, false);
