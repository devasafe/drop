import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { getDeletionBlockers, deleteAccount as runDeleteAccount } from '../services/accountDeletion.service';
import { clearTokenCookie, clearUserCookie } from '../utils/cookieManager';

/** GET /api/account/deletion-check — o que impede excluir a conta agora. */
export const deletionCheck = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const blockers = await getDeletionBlockers(String(req.user!.id));
    return res.json({ blockers });
  } catch (err) {
    console.error('[account] deletion-check:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/** POST /api/account/delete { password } — exclui (anonimiza) a conta e encerra a sessão. */
export const deleteAccount = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await runDeleteAccount(String(req.user!.id), req.body?.password);
    if (result.ok === false) {
      const { status, error, message, blockers } = result;
      return res.status(status).json({ error, message, blockers });
    }
    clearTokenCookie(res);
    clearUserCookie(res);
    return res.json({ message: 'Conta excluída' });
  } catch (err) {
    console.error('[account] delete:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
