import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import logger from '../config/logger';
import { actorFromRequest, sendMoneyActionError } from '../services/adminMoneyAction.service';
import { permissionCheckFor } from '../services/adminOps/common';
import { approveAllForSubject, SubjectKind } from '../services/verification/approveAll';

// D3b-2b · POST /api/verification/admin/subject/:kind/:id/approve-all — body { items }.
// A permissão do tipo é conferida na rota; a de cada item, no service (403 PERMISSION_DENIED).
export const approveAllSubject = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const can = await permissionCheckFor(req.user as any);
    const result = await approveAllForSubject(
      req.params.kind as SubjectKind,
      String(req.params.id),
      req.body?.items,
      { ...actorFromRequest(req), can },
    );
    return res.json(result);
  } catch (err) {
    if (sendMoneyActionError(res, err)) return;
    logger.error('Erro ao aprovar tudo da verificação', err as Error, { kind: req.params.kind, id: req.params.id });
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
