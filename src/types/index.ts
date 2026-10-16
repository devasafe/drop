import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        activeRole?: string;
        roles?: string[];
        name?: string;
      };
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    activeRole?: string;
    /** Papéis da conta lidos do BANCO pelo `authenticate` (não do token). */
    roles?: string[];
    name?: string;
  };
}
