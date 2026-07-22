import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';
import userRepository from '../repositories/user.repository';
import { getDefaultAddress } from '../utils/userHelpers';

// Retorna os dados do usuário autenticado
export const getMe = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    console.log(`[getMe] Requisição para usuário: ${userId}`);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = await userRepository.findByIdWithAddresses(userId);
    console.log(`[getMe] Resultado: ${user ? 'Usuário encontrado' : 'Usuário NÃO encontrado'}`);
    if (user) {
      console.log(`[getMe] User name: ${user.name}, addresses count: ${(user.addresses || []).length}`);
    }
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Nunca devolver credenciais. O Mongoose fazia isso com .select('-passwordHash');
    // aqui é explícito.
    const { passwordHash, bankInfoEncrypted, ...safe } = user as any;

    // `_id` é mantido junto de `id`: o frontend ainda lê `_id` do tempo do Mongo.
    const userData: any = { ...safe, _id: user.id };
    userData.mainAddress = getDefaultAddress(user as any);

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
    const user = await userRepository.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const { name, email, cpf, rg, telefone } = req.body;
    const digits = (v?: string | null) => (v || '').replace(/\D/g, '');

    // `verification` é JSONB: montamos o objeto inteiro e gravamos de uma vez
    // (não há `markModified` como no Mongoose).
    const verification: any = user.verification ?? {
      email: { status: 'pending' },
      phone: { status: 'pending' },
      document: { status: 'none' },
    };

    const data: Prisma.UserUpdateInput = {};

    const cpfChanging = cpf !== undefined && digits(cpf) !== digits(user.cpf);
    const rgChanging = rg !== undefined && digits(rg) !== digits(user.rg);

    // ✅ CPF/RG não podem mudar depois que o documento foi APROVADO (fraude/identidade).
    if ((cpfChanging || rgChanging) && verification?.document?.status === 'approved') {
      return res.status(409).json({ error: 'CPF e RG não podem ser alterados após o documento ser aprovado. Entre em contato com o suporte.' });
    }

    let docReset = false;
    if (cpfChanging) {
      const cpfDigits = digits(cpf);
      if (cpfDigits) {
        const dup = await prisma.user.findFirst({ where: { id: { not: userId }, cpf: cpfDigits } });
        if (dup) return res.status(409).json({ error: 'Este CPF já está cadastrado em outra conta' });
      }
      data.cpf = cpfDigits; docReset = true;
    }
    if (rgChanging) {
      const rgDigits = digits(rg);
      if (rgDigits) {
        const dup = await prisma.user.findFirst({ where: { id: { not: userId }, rg: rgDigits } });
        if (dup) return res.status(409).json({ error: 'Este RG já está cadastrado em outra conta' });
      }
      data.rg = rgDigits; docReset = true;
    }
    if (docReset) verification.document = { status: 'none' };

    let emailReset = false;
    if (email !== undefined && email !== user.email) {
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) return res.status(409).json({ error: 'Email já está em uso' });
      data.email = email;
      verification.email = { status: 'pending' };
      emailReset = true;
    }

    if (name !== undefined) data.name = name;
    if (telefone !== undefined) data.telefone = telefone;

    data.verification = verification;
    await userRepository.update(userId, data);

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

    // O repositório decifra `bankInfo` na leitura.
    const user = await userRepository.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    const bankInfo = user.bankInfo as any;

    return res.json({
      isConfigured: bankInfo?.isConfigured || false,
      bankInfo: bankInfo?.isConfigured ? {
        banco: bankInfo.banco,
        agencia: bankInfo.agencia,
        conta: bankInfo.conta,
        cpfBanco: bankInfo.cpfBanco
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

    const user = await userRepository.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Verifica se já foi configurado
    if ((user.bankInfo as any)?.isConfigured) {
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

    // Configura os dados bancários — o repositório cifra antes de gravar.
    await userRepository.update(userId, {
      bankInfo: { banco, agencia, conta, cpfBanco, isConfigured: true },
    });

    return res.json({
      success: true,
      message: 'Dados bancários configurados com sucesso',
      bankInfo: { banco, agencia, conta }
    });
  } catch (err: any) {
    console.error('[USER ERROR]', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
