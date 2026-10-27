/**
 * Autorização de salas do Socket.io — o SERVIDOR decide quem entra em qual sala.
 * Socket é notificação, não fonte de verdade: as salas carregam PIN, endereço e pedidos,
 * então o `join` vindo do cliente nunca é aceito sem passar por aqui (fail closed).
 */
import { prisma } from '../lib/prisma';
import { isStoreOwner } from '../utils/storeOwnership';
import { isMotoboyVerified } from '../utils/courierVerification';
import { staffRolesOf } from '../controllers/rolePermissionsController';

export const ADMIN_ROLES = ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'];

export interface SocketUser {
  id: string;
  /** Papel ativo (do token, conferido no banco no handshake). */
  role: string;
  /** Papéis da conta lidos do BANCO no handshake: os de equipe somam salas de admin. */
  roles?: string[];
}

/**
 * Papéis administrativos que valem para as salas `admin` e `admin:<papel>`: o papel ativo
 * mais os papéis de equipe da conta (equipe é acréscimo, como na união de permissões).
 * CEO só pelo papel ativo (`ceo` não é papel de equipe).
 */
export function adminRolesOf(user: SocketUser): string[] {
  return staffRolesOf({ activeRole: user.role, roles: user.roles }).filter((r) => ADMIN_ROLES.includes(r));
}

const kycEnforced = () => process.env.KYC_ENFORCED === 'true';

/** Motoboy pode receber o pool de corridas (sala `motoboys`)? */
export async function canJoinMotoboysRoom(user: SocketUser): Promise<boolean> {
  if (user.role !== 'motoboy') return false;
  const db = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: { status: true, verification: true },
  });
  if (!db || db.status === 'blocked' || db.status === 'deleted') return false;
  return !kycEnforced() || isMotoboyVerified(db);
}

export async function authorizeRoom(user: SocketUser | undefined, room: unknown): Promise<boolean> {
  if (!user?.id || typeof room !== 'string' || !room) return false;

  if (room.startsWith('user:')) return room === `user:${user.id}`;
  if (room.startsWith('store:')) return isStoreOwner(room.slice('store:'.length), user.id);
  if (room === 'motoboys') return canJoinMotoboysRoom(user);
  if (room === 'admin') return adminRolesOf(user).length > 0;
  if (room.startsWith('admin:')) return adminRolesOf(user).includes(room.slice('admin:'.length));
  if (room.startsWith('conversation:')) return isConversationParticipant(room.slice('conversation:'.length), user.id);

  return false;
}

/** Usuário participa da conversa? (para eventos de chat que repassam para `conversation:<id>`). */
export async function isConversationParticipant(conversationId: unknown, userId: string): Promise<boolean> {
  if (!conversationId || !userId) return false;
  const conv = await prisma.conversation.findUnique({
    where: { id: String(conversationId) },
    select: { participant1: true, participant2: true },
  });
  if (!conv) return false;
  const p1 = (conv.participant1 as any)?.userId;
  const p2 = (conv.participant2 as any)?.userId;
  return String(p1) === String(userId) || String(p2) === String(userId);
}

/** Lojas do usuário — usadas para entrar automaticamente em `store:<id>` na conexão. */
export async function ownedStoreIds(userId: string): Promise<string[]> {
  const stores = await prisma.store.findMany({ where: { ownerId: String(userId) }, select: { id: true } });
  return stores.map((s) => s.id);
}
