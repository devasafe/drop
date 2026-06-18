import { Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import User from '../models/User';
import PasswordResetToken from '../models/PasswordResetToken';
import { AuthenticatedRequest } from '../types';
import { getDefaultAddress } from '../utils/userHelpers';
import { uploadToCloudinary } from '../utils/cloudinary';
import { sendEmail } from '../services/emailProvider';
import env from '../config/env';

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

// ✅ SEGURANÇA: validação de entrada do registro (formato + limites de tamanho)
const optionalShort = z.string().trim().max(30).optional().or(z.literal(''));
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome').max(80, 'Nome muito longo'),
  email: z.string().trim().toLowerCase().email('Email inválido').max(120),
  password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres').max(128, 'Senha muito longa'),
  role: z.string().trim().max(20).optional(),
  telefone: optionalShort,
  cpf: optionalShort,
  rg: optionalShort,
  dataNascimento: optionalShort,
  sexo: optionalShort,
}).passthrough();

// Fonte única de verdade do segredo (config/env garante obrigatoriedade em produção)
const JWT_SECRET = env.JWT_SECRET;

// Importar Wallet model
let Wallet: any;
try {
  Wallet = require('../models/Wallet').default || require('../models/Wallet');
} catch (e) {
  console.warn('⚠️ Wallet model não encontrado');
}

// Validar magic bytes para detectar fake images (usando buffer em memória)
const isValidImageBuffer = (buffer: Buffer): boolean => {
  if (buffer.length < 12) return false;
  const hex = buffer.slice(0, 12).toString('hex').toLowerCase();
  return (
    hex.startsWith('89504e47') || // PNG
    hex.startsWith('ffd8ff') ||   // JPEG
    hex.startsWith('47494638') || // GIF
    hex.startsWith('52494646')    // WebP (RIFF)
  );
};

export const register = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos' });
    }
    const { name, email, password, role, telefone, cpf, rg, dataNascimento, sexo } = parsed.data as any;

    // Validar foto obrigatória para motoboy e lojista
    if ((role === 'motoboy' || role === 'lojista') && !req.file) {
      return res.status(400).json({ error: `Photo is required for ${role}` });
    }

    // Validar integridade da imagem
    if (req.file) {
      if (!isValidImageBuffer(req.file.buffer)) {
        return res.status(400).json({ error: 'Invalid image file' });
      }
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Upload foto para Cloudinary se existir
    const photoPath = req.file ? await uploadToCloudinary(req.file.buffer, 'drop/users') : undefined;

    // Todos os usuários podem ser cliente + seu role específico
    const roles = role && role !== 'cliente' ? [role, 'cliente'] : ['cliente'];

    const user = new User({
      name,
      email,
      passwordHash,
      role, // Legacy
      roles, // Novo - agora inclui 'cliente' para todos
      activeRole: role || 'cliente', // Novo
      telefone,
      cpf,
      rg,
      dataNascimento,
      sexo,
      photo: photoPath
    });
    await user.save();

    // ✨ CRIAR CARTEIRA AUTOMATICAMENTE
    if (Wallet) {
      try {
        const wallet = new Wallet({
          owner: user._id.toString(),
          ownerType: 'user',
          balance: 0,
          totalIncome: 0,
          totalSpent: 0,
          history: [],
          createdAt: new Date(),
          updatedAt: new Date()
        });
        await wallet.save();
        console.log(`✅ Carteira criada automaticamente para usuário: ${user._id}`);
      } catch (err) {
        console.warn(`⚠️ Erro ao criar carteira para ${user._id}:`, err);
        // Continuar mesmo se falhar na carteira
      }
    }

    // Não criar loja automaticamente. Loja será criada após cadastro pelo painel.
    return res.status(201).json({ id: user._id, email: user.email, role: user.role });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const matched = await bcrypt.compare(password, user.passwordHash);
    if (!matched) return res.status(401).json({ error: 'Invalid credentials' });

    // Conta bloqueada nao pode logar
    if ((user as any).status === 'blocked') {
      return res.status(403).json({
        error: 'Conta bloqueada',
        reason: (user as any).blockReason || 'Entre em contato com o suporte',
      });
    }

    if (!JWT_SECRET) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Usar activeRole se existir, senão usar role antigo por compatibilidade
    const activeRole = user.activeRole || user.role || 'cliente';
    
    // Garantir múltiplos roles: motoboy e lojista também podem ser cliente
    let allRoles = user.roles || [user.role || 'cliente'];
    if (!Array.isArray(allRoles)) {
      allRoles = [allRoles];
    }
    
    // SEMPRE adicionar 'cliente' se não tiver (para todos os usuários)
    if (!allRoles.includes('cliente')) {
      allRoles.push('cliente');
      user.roles = allRoles;
      await user.save();
      if (process.env.NODE_ENV === 'development') console.log('✅ Updated user roles in login. Now has:', allRoles);
    }

    if (!JWT_SECRET) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const token = jwt.sign(
      { id: user._id, role: activeRole, activeRole, roles: allRoles },
      JWT_SECRET as jwt.Secret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '2d' } as jwt.SignOptions
    );

    // ✅ SEGURANÇA: Armazenar token em HttpOnly cookie
    const { setTokenCookie, setUserCookie } = require('../utils/cookieManager');
    setTokenCookie(res, token);
    setUserCookie(res, {
      id: user._id,
      name: user.name,
      email: user.email,
      role: activeRole,
      activeRole: activeRole,
      roles: allRoles,
      storeId: user.storeId?.toString() || null, // ✅ CRÍTICO: incluir storeId
    });

    return res.json({
      token, // Retornar para compatibilidade com clientes antigos
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: activeRole, // Manter compatibilidade
        activeRole: activeRole, // Novo
        roles: allRoles, // Novo - múltiplos roles
        storeId: user.storeId?.toString() || null, // ✅ CRÍTICO: incluir storeId
        mainAddress: getDefaultAddress(user)
      }
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/forgot-password — envia código de redefinição por email
export const forgotPassword = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email obrigatório' });

    const user = await User.findOne({ email });
    // Resposta genérica: nunca revela se o email existe ou não
    const genericOk = { message: 'Se o email estiver cadastrado, enviamos um código de redefinição.' };

    if (user) {
      // Anti-spam: no máximo 1 código a cada 60s
      const recent = await PasswordResetToken.findOne({ userId: user.id }).sort({ createdAt: -1 });
      if (recent && Date.now() - recent.createdAt.getTime() < 60_000) {
        return res.json(genericOk);
      }
      await PasswordResetToken.deleteMany({ userId: user.id });
      const code = String(crypto.randomInt(100000, 1000000)); // 6 dígitos
      await PasswordResetToken.create({
        userId: user.id,
        tokenHash: sha256(code),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min
      });
      try {
        await sendEmail(
          user.email,
          'Redefinição de senha — DROP',
          `Seu código para redefinir a senha é <b style="font-size:22px;letter-spacing:2px">${code}</b>.<br/>Ele expira em 15 minutos.<br/><br/>Se não foi você que pediu, ignore este email.`
        );
      } catch (mailErr: any) {
        await PasswordResetToken.deleteMany({ userId: user.id });
        const detail = mailErr?.response?.data?.message || mailErr?.message || 'erro desconhecido';
        return res.status(502).json({ error: `Falha ao enviar o email: ${detail}` });
      }
    }
    return res.json(genericOk);
  } catch (err) {
    console.error('[forgotPassword] error', err);
    return res.status(500).json({ error: 'Erro ao processar a solicitação' });
  }
};

// POST /auth/reset-password — valida o código e define a nova senha
export const resetPassword = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) return res.status(400).json({ error: 'Email, código e nova senha são obrigatórios' });
    if (String(newPassword).length < 8) return res.status(400).json({ error: 'A senha deve ter ao menos 8 caracteres' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Código inválido ou expirado' });

    const record = await PasswordResetToken.findOne({ userId: user.id }).sort({ createdAt: -1 });
    if (!record || record.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Código inválido ou expirado' });
    }
    if (record.tokenHash !== sha256(String(code).trim())) {
      return res.status(400).json({ error: 'Código incorreto' });
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(String(newPassword), salt);
    await user.save();
    await PasswordResetToken.deleteMany({ userId: user.id });

    return res.json({ message: 'Senha redefinida com sucesso. Você já pode entrar.' });
  } catch (err) {
    console.error('[resetPassword] error', err);
    return res.status(500).json({ error: 'Erro ao redefinir a senha' });
  }
};

// POST /auth/logout — limpa os cookies de sessão (token httpOnly + user)
export const logout = async (_req: AuthenticatedRequest, res: Response) => {
  const { clearTokenCookie, clearUserCookie } = require('../utils/cookieManager');
  clearTokenCookie(res);
  clearUserCookie(res);
  return res.json({ message: 'Logout efetuado' });
};

export const switchRole = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { newRole } = req.body;
    const userId = req.user?.id || (req as any).userId;

    if (process.env.NODE_ENV === 'development') console.log('🔄 Switch role request:', { userId, newRole });

    if (!newRole) {
      return res.status(400).json({ error: 'Missing newRole' });
    }

    if (!['cliente', 'lojista', 'motoboy', 'ceo', 'marketing', 'gerente_geral', 'gerente_clientes'].includes(newRole)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Garantir que roles está sempre preenchido
    let roles = user.roles || [user.role || 'cliente'];
    if (!Array.isArray(roles)) {
      roles = [roles];
    }

    // Se é motoboy ou lojista, adicionar também cliente se não tiver
    if ((user.role === 'motoboy' || user.role === 'lojista') && !roles.includes('cliente')) {
      roles.push('cliente');
      user.roles = roles;
      await user.save();
    }

    if (!roles.includes(newRole)) {
      return res.status(403).json({ error: 'User does not have this role' });
    }

    // Atualizar activeRole
    user.activeRole = newRole as any;
    await user.save();

    if (!JWT_SECRET) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const token = jwt.sign(
      { id: user._id, role: newRole, activeRole: newRole, roles },
      JWT_SECRET as jwt.Secret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '2d' } as jwt.SignOptions
    );

    // Atualiza o cookie httpOnly com o novo role (senão o cookie ficaria com o role antigo)
    const { setTokenCookie, setUserCookie } = require('../utils/cookieManager');
    setTokenCookie(res, token);
    setUserCookie(res, { id: user._id, name: user.name, email: user.email, role: newRole, activeRole: newRole, roles: user.roles });

    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: newRole,
        activeRole: newRole,
        roles: user.roles || [user.role || 'cliente'],
        storeId: user.storeId?.toString() || null, // ✅ CRÍTICO: incluir storeId
        mainAddress: getDefaultAddress(user)
      }
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Endpoint para migrar usuários antigos e adicionar 'cliente' a todos
export const migrateUsersToMultiRole = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Buscar todos os usuários que não têm 'cliente' nos roles
    const usersToUpdate = await User.find({
      $or: [
        { roles: { $exists: false } },
        { roles: { $type: 'string' } }, // roles é string em vez de array
        { roles: { $not: { $in: ['cliente'] } } } // roles é array mas não contém 'cliente'
      ]
    });

    let updated = 0;
    for (const user of usersToUpdate) {
      let roles = user.roles || [user.role || 'cliente'];
      if (!Array.isArray(roles)) {
        roles = [roles];
      }
      if (!roles.includes('cliente')) {
        roles.push('cliente');
      }
      user.roles = roles;
      if (!user.activeRole) {
        user.activeRole = user.role || 'cliente';
      }
      await user.save();
      updated++;
    }

    console.log(`✅ Migration completed: Updated ${updated} users to have 'cliente' role`);
    return res.json({
      message: `Successfully migrated ${updated} users`,
      updated
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Migration error:', err);
    return res.status(500).json({ error: 'Migration failed' });
  }
};
