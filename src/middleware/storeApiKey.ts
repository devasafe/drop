import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { parseApiKey, verifySecret } from '../services/storeIntegration';

export interface ApiKeyRequest extends Request {
  integrationStoreId?: string;
  integrationScopes?: string[];
}

/** Exige que a chave tenha o escopo dado (ex.: 'write' nos endpoints de escrita). */
export const requireScope = (scope: string) => (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  if (!req.integrationScopes?.includes(scope)) {
    return res.status(403).json({ error: `Esta chave não tem permissão de ${scope}` });
  }
  next();
};

/**
 * Autentica requisições de máquina por `Authorization: Bearer dk_...`. Resolve a
 * loja dona da chave e injeta `req.integrationStoreId`. Read-only (integração).
 */
export const authenticateStoreApiKey = async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  const header = String(req.headers['authorization'] || '');
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return res.status(401).json({ error: 'Envie sua API key em Authorization: Bearer <key>' });

  const parsed = parseApiKey(m[1]);
  if (!parsed) return res.status(401).json({ error: 'Formato de API key inválido' });

  const record = await prisma.storeApiKey.findUnique({ where: { prefix: parsed.prefix } });
  if (!record || record.revokedAt) return res.status(401).json({ error: 'API key inválida ou revogada' });
  if (!verifySecret(parsed.secret, record.keyHash)) return res.status(401).json({ error: 'API key inválida' });

  // lastUsedAt best-effort + throttle (evita 1 write por request sob polling):
  // só atualiza se passou > 60s desde o último uso registrado.
  if (!record.lastUsedAt || Date.now() - new Date(record.lastUsedAt).getTime() > 60_000) {
    prisma.storeApiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  req.integrationStoreId = record.storeId;
  req.integrationScopes = record.scopes;
  next();
};
