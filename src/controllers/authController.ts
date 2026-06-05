import { Response } from 'express';
import bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import User from '../models/User';
import { AuthenticatedRequest } from '../types';
import { getDefaultAddress } from '../utils/userHelpers';
import { uploadToCloudinary } from '../utils/cloudinary';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET não está configurado. Use a variável de ambiente JWT_SECRET');
}

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
    const { name, email, password, role, telefone, cpf, rg, dataNascimento, sexo } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });

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
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
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
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
    );

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
