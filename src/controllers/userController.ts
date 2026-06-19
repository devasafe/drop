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
 * PATCH /user/me — edita dados pessoais.
 * ✅ KYC: mudar CPF/RG reseta o documento; mudar email reseta o email (reverificar).
 */
export const updateMe = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const { name, email, cpf, rg, telefone } = req.body;
    const digits = (v?: string) => (v || '').replace(/\D/g, '');

    if (!user.verification) {
      user.verification = { email: { status: 'pending' }, phone: { status: 'pending' }, document: { status: 'none' } } as any;
    }

    let docReset = false;
    if (cpf !== undefined && digits(cpf) !== digits(user.cpf)) {
      const cpfDigits = digits(cpf);
      if (cpfDigits) {
        const dup = await User.findOne({ _id: { $ne: userId }, cpf: cpfDigits });
        if (dup) return res.status(409).json({ error: 'Este CPF já está cadastrado em outra conta' });
      }
      user.cpf = cpfDigits; docReset = true;
    }
    if (rg !== undefined && digits(rg) !== digits(user.rg)) {
      const rgDigits = digits(rg);
      if (rgDigits) {
        const dup = await User.findOne({ _id: { $ne: userId }, rg: rgDigits });
        if (dup) return res.status(409).json({ error: 'Este RG já está cadastrado em outra conta' });
      }
      user.rg = rgDigits; docReset = true;
    }
    if (docReset) user.verification!.document = { status: 'none' };

    let emailReset = false;
    if (email !== undefined && email !== user.email) {
      const exists = await User.findOne({ email });
      if (exists) return res.status(409).json({ error: 'Email já está em uso' });
      user.email = email;
      user.verification!.email = { status: 'pending' };
      emailReset = true;
    }

    if (name !== undefined) user.name = name;
    if (telefone !== undefined) user.telefone = telefone;

    user.markModified('verification');
    await user.save();

    // Documento alterado afeta a verificação de loja/motoboy do dono
    if (docReset) {
      const { recomputeStoresForOwner } = require('../utils/storeVerification');
      await recomputeStoresForOwner(userId);
    }

    return res.json({ message: 'Dados atualizados', verificationReset: { document: docReset, email: emailReset } });
  } catch (err) {
    console.error('[updateMe] error', err);
    return res.status(500).json({ error: 'Erro ao atualizar dados' });
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
