import { Response } from 'express';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../types';
import User from '../models/User';
import OtpCode from '../models/OtpCode';
import EmailVerificationToken from '../models/EmailVerificationToken';
import otpProvider from '../services/otpProvider';
import { sendEmail } from '../services/emailProvider';
import { uploadToCloudinary } from '../utils/cloudinary';
import { isValidCPF, isValidRG, toE164BR } from '../utils/documentValidation';
import { missingClientVerifications } from '../utils/clientVerification';
import logger from '../config/logger';
import { emitAdminNotification } from '../utils/socketEmitter';

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
    const code = String(crypto.randomInt(100000, 1000000)); // 6 dígitos
    await EmailVerificationToken.create({
      userId: user.id,
      tokenHash: sha256(code),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min
    });

    try {
      await sendEmail(
        user.email,
        'Seu código de verificação — DROP',
        `Seu código de verificação é <b style="font-size:22px;letter-spacing:2px">${code}</b>.<br/>Ele expira em 15 minutos.`
      );
    } catch (mailErr: any) {
      // Libera o rate-limit (o código não foi entregue) e mostra o erro real
      await EmailVerificationToken.deleteMany({ userId: user.id });
      const detail = mailErr?.response?.data?.message || mailErr?.response?.data?.error || mailErr?.message || 'erro desconhecido';
      logger.error('Falha ao enviar email de verificação', { detail });
      return res.status(502).json({ error: `Falha ao enviar o email: ${detail}` });
    }
    return res.json({ message: 'Código enviado para o seu email' });
  } catch (err) {
    logger.error('Erro ao reenviar email', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const verifyEmail = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Código obrigatório' });
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    const record = await EmailVerificationToken.findOne({ userId }).sort({ createdAt: -1 });
    if (!record || record.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Código inválido ou expirado' });
    }
    if (record.tokenHash !== sha256(String(code).trim())) {
      return res.status(400).json({ error: 'Código incorreto' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    ensureVerification(user);
    user.verification!.email = { status: 'verified', verifiedAt: new Date() };
    user.markModified('verification');
    await user.save();
    await EmailVerificationToken.deleteMany({ userId });

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
    const { type } = req.body;
    if (!['cpf', 'rg'].includes(type)) return res.status(400).json({ error: 'Tipo de documento inválido' });

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

    // O número verificado é SEMPRE o do cadastro (editar-conta), nunca digitado aqui.
    // Garante que o documento aprovado e o CPF/RG salvos no perfil nunca divirjam.
    const docNumber = type === 'cpf' ? user.cpf : user.rg;
    if (!docNumber) {
      const label = type === 'cpf' ? 'CPF' : 'RG';
      return res.status(400).json({ error: `Cadastre seu ${label} em "Editar meus dados" antes de enviar o documento para verificação` });
    }
    if (type === 'cpf' && !isValidCPF(docNumber)) {
      return res.status(400).json({ error: 'O CPF cadastrado é inválido. Corrija em "Editar meus dados".' });
    }
    if (type === 'rg' && !isValidRG(docNumber)) {
      return res.status(400).json({ error: 'O RG cadastrado é inválido. Corrija em "Editar meus dados".' });
    }

    const folder = `verifications/${user.id}`;
    const frontUrl = await uploadToCloudinary(files.front[0].buffer, folder);
    const backUrl = await uploadToCloudinary(files.back[0].buffer, folder);

    user.verification!.document = {
      type,
      status: 'pending',
      number: docNumber,
      frontUrl,
      backUrl,
      submittedAt: new Date(),
    };
    user.markModified('verification');
    await user.save();

    emitAdminNotification({
      title: 'Nova verificação pendente',
      body: `${user.name} enviou um documento (${String(type).toUpperCase()}) para análise.`,
      url: '/admin/verificacoes',
      tag: 'verification',
    });
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
      .select('name email roles role verification')
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
