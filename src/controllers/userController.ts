import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import User from '../models/User';
import { getDefaultAddress } from '../utils/userHelpers';

// Retorna os dados do usuário autenticado
export const getMe = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    console.log(`[getMe] Requisição para usuário: ${userId}`);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = await User.findById(userId).select('-passwordHash');
    console.log(`[getMe] Resultado: ${user ? 'Usuário encontrado' : 'Usuário NÃO encontrado'}`);
    if (user) {
      console.log(`[getMe] User name: ${user.name}, addresses count: ${(user.addresses || []).length}`);
    }
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    
    // ✅ NOVO: Computar mainAddress dinamicamente (retrocompat)
    const userData = user.toObject() as any;
    userData.mainAddress = getDefaultAddress(user);
    
    return res.json(userData);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Erro ao buscar dados do usuário' });
  }
};

/**
 * GET /user/bank-info
 * Retorna os dados bancários do usuário (se configurado)
 */
export const getBankInfo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const user = await User.findById(userId).select('bankInfo');
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    return res.json({
      isConfigured: user.bankInfo?.isConfigured || false,
      bankInfo: user.bankInfo?.isConfigured ? {
        banco: user.bankInfo.banco,
        agencia: user.bankInfo.agencia,
        conta: user.bankInfo.conta,
        cpfBanco: user.bankInfo.cpfBanco
      } : null
    });
  } catch (err: any) {
    console.error('[USER ERROR]', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * POST /user/bank-info
 * Configura os dados bancários do usuário (apenas uma vez)
 */
export const setBankInfo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Verifica se já foi configurado
    if (user.bankInfo?.isConfigured) {
      return res.status(400).json({
        error: 'Dados bancários já foram configurados. Não é possível editá-los novamente.'
      });
    }

    const { banco, agencia, conta, cpfBanco } = req.body;

    // Validação básica
    if (!banco || !agencia || !conta || !cpfBanco) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    if (!/^\d{11}$/.test(cpfBanco)) {
      return res.status(400).json({ error: 'CPF deve ter exatamente 11 dígitos' });
    }

    // Configura os dados bancários
    user.bankInfo = {
      banco,
      agencia,
      conta,
      cpfBanco,
      isConfigured: true
    };

    await user.save();

    return res.json({
      success: true,
      message: 'Dados bancários configurados com sucesso',
      bankInfo: {
        banco: user.bankInfo.banco,
        agencia: user.bankInfo.agencia,
        conta: user.bankInfo.conta
      }
    });
  } catch (err: any) {
    console.error('[USER ERROR]', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
