// src/controllers/debtController.ts
import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { findPendingDebt } from '../repositories/customerDebt.repository';

export const getMyPendingDebt = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customerId = req.user?.id;
    if (!customerId) return res.status(401).json({ error: 'Não autenticado' });

    const debt = await findPendingDebt(customerId);
    return res.json({ debt: debt || null });
  } catch (error: any) {
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
