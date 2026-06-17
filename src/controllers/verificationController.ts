import { Response } from 'express';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../types';
import User from '../models/User';
import OtpCode from '../models/OtpCode';
import EmailVerificationToken from '../models/EmailVerificationToken';
import otpProvider from '../services/otpProvider';
import { sendEmail } from '../services/emailProvider';
import { uploadToCloudinary } from '../utils/cloudinary';
import { isValidCPF, isValidRG, toE164BR, onlyDigits } from '../utils/documentValidation';
import { missingClientVerifications } from '../utils/clientVerification';
import logger from '../config/logger';

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const ensureVerification = (user: any) => {
  if (!user.verification) {
    user.verification = { email: { status: 'pending' }, phone: { status: 'pending' }, document: { status: 'none' } };
  }
};

// GET /api/verification/me — status do próprio usuário
export const getMyVerification = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await User.findById(req.user?.id).select('verification');
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    ensureVerification(user);
    return res.json({
      verification: user.verification,
      missing: missingClientVerifications(user),
      verified: missingClientVerifications(user).length === 0,
    });
  } catch (err) {
    logger.error('Erro ao buscar verificação', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ===================== EMAIL =====================
export const resendEmailVerification = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await User.findById(req.user?.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    ensureVerification(user);
    if (user.verification!.email.status === 'verified') {
      return res.status(400).json({ error: 'Email já verificado' });
    }

    // Rate-limit simples: no máximo 1 token a cada 60s
    const recent = await EmailVerificationToken.findOne({ userId: user.id }).sort({ createdAt: -1 });
    if (recent && Date.now() - recent.createdAt.getTime() < 60_000) {
      return res.status(429).json({ error: 'Aguarde um momento antes de reenviar' });
    }

    await EmailVerificationToken.deleteMany({ userId: user.id });
    const token = crypto.randomBytes(32).toString('hex');
    await EmailVerificationToken.create({
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    });

    const link = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
    await sendEmail(user.email, 'Verifique seu email — DROP', `Confirme seu email: <a href="${link}">${link}</a>`);
    return res.json({ message: 'Email de verificação enviado' });
  } catch (err) {
    logger.error('Erro ao reenviar email', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const verifyEmail = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token obrigatório' });

    const record = await EmailVerificationToken.findOne({ tokenHash: sha256(String(token)) });
    if (!record || record.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Token inválido ou expirado' });
    }

    const user = await User.findById(record.userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    ensureVerification(user);
    user.verification!.email = { status: 'verified', verifiedAt: new Date() };
    user.markModified('verification');
    await user.save();
    await EmailVerificationToken.deleteMany({ userId: record.userId });

    return res.json({ message: 'Email verificado com sucesso' });
  } catch (err) {
    logger.error('Erro ao verificar email', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ===================== TELEFONE (OTP) =====================
export const sendPhoneOtp = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { phone } = req.body;
    const e164 = toE164BR(String(phone || ''));
    if (!e164) return res.status(400).json({ error: 'Telefone inválido' });

    const user = await User.findById(req.user?.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Anti-spam: 1 envio a cada 60s
    const recent = await OtpCode.findOne({ userId: user.id }).sort({ createdAt: -1 });
    if (recent && Date.now() - recent.createdAt.getTime() < 60_000) {
      return res.status(429).json({ error: 'Aguarde um momento antes de pedir outro código' });
    }

    await OtpCode.deleteMany({ userId: user.id });
    const code = String(crypto.randomInt(100000, 1000000));
    await OtpCode.create({
      userId: user.id,
      channel: 'whatsapp',
      e164,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
    });

    await otpProvider.sendOtp(e164, code);
    return res.json({ message: 'Código enviado' });
  } catch (err) {
    logger.error('Erro ao enviar OTP', err as Error);
    return res.status(500).json({ error: 'Erro ao enviar código' });
  }
};

export const verifyPhoneOtp = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Código obrigatório' });

    const user = await User.findById(req.user?.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const otp = await OtpCode.findOne({ userId: user.id }).sort({ createdAt: -1 });
    if (!otp || otp.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Código inválido ou expirado' });
    }
    if (otp.attempts >= 5) {
      await OtpCode.deleteMany({ userId: user.id });
      return res.status(429).json({ error: 'Muitas tentativas. Solicite um novo código.' });
    }

    if (otp.codeHash !== sha256(String(code))) {
      otp.attempts += 1;
      await otp.save();
      return res.status(400).json({ error: 'Código incorreto' });
    }

    ensureVerification(user);
    user.verification!.phone = { status: 'verified', e164: otp.e164, verifiedAt: new Date() };
    if (!user.telefone) user.telefone = otp.e164;
    user.markModified('verification');
    await user.save();
    await OtpCode.deleteMany({ userId: user.id });

    return res.json({ message: 'Telefone verificado com sucesso' });
  } catch (err) {
    logger.error('Erro ao verificar OTP', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ===================== DOCUMENTO (CPF/RG) =====================
export const submitDocument = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, number } = req.body;
    if (!['cpf', 'rg'].includes(type)) return res.status(400).json({ error: 'Tipo de documento inválido' });

    if (type === 'cpf' && !isValidCPF(String(number))) {
      return res.status(400).json({ error: 'CPF inválido' });
    }
    if (type === 'rg' && !isValidRG(String(number))) {
      return res.status(400).json({ error: 'RG inválido' });
    }

    const files = req.files as { front?: any[]; back?: any[] } | undefined;
    if (!files?.front?.[0] || !files?.back?.[0]) {
      return res.status(400).json({ error: 'Envie a frente e o verso do documento' });
    }

    const user = await User.findById(req.user?.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    ensureVerification(user);
    if (user.verification!.document.status === 'pending') {
      return res.status(409).json({ error: 'Documento já em análise' });
    }
    if (user.verification!.document.status === 'approved') {
      return res.status(409).json({ error: 'Documento já aprovado' });
    }

    const folder = `verifications/${user.id}`;
    const frontUrl = await uploadToCloudinary(files.front[0].buffer, folder);
    const backUrl = await uploadToCloudinary(files.back[0].buffer, folder);

    user.verification!.document = {
      type,
      status: 'pending',
      number: onlyDigits(String(number)),
      frontUrl,
      backUrl,
      submittedAt: new Date(),
    };
    user.markModified('verification');
    await user.save();

    return res.json({ message: 'Documento enviado para análise', status: 'pending' });
  } catch (err) {
    logger.error('Erro ao enviar documento', err as Error);
    return res.status(500).json({ error: 'Erro ao enviar documento' });
  }
};

// ===================== ADMIN =====================
export const listPendingVerifications = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await User.find({ 'verification.document.status': 'pending' })
      .select('name email verification')
      .sort({ 'verification.document.submittedAt': 1 })
      .lean();
    return res.json({ count: users.length, items: users });
  } catch (err) {
    logger.error('Erro ao listar verificações', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const approveDocument = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    ensureVerification(user);
    if (user.verification!.document.status !== 'pending') {
      return res.status(400).json({ error: 'Documento não está pendente' });
    }
    user.verification!.document.status = 'approved';
    user.verification!.document.reviewedBy = req.user?.id;
    user.verification!.document.reviewedAt = new Date();
    user.verification!.document.rejectionReason = undefined;
    user.markModified('verification');
    await user.save();
    logger.info('[verification][AUDIT] documento aprovado', { userId, by: req.user?.id });
    return res.json({ message: 'Documento aprovado' });
  } catch (err) {
    logger.error('Erro ao aprovar documento', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const rejectDocument = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    ensureVerification(user);
    if (user.verification!.document.status !== 'pending') {
      return res.status(400).json({ error: 'Documento não está pendente' });
    }
    user.verification!.document.status = 'rejected';
    user.verification!.document.reviewedBy = req.user?.id;
    user.verification!.document.reviewedAt = new Date();
    user.verification!.document.rejectionReason = reason || 'Documento não aprovado';
    user.markModified('verification');
    await user.save();
    logger.info('[verification][AUDIT] documento rejeitado', { userId, by: req.user?.id, reason });
    return res.json({ message: 'Documento rejeitado' });
  } catch (err) {
    logger.error('Erro ao rejeitar documento', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
