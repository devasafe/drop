/**
 * D3b-2a · ficha da pessoa (spec 6). Só leitura.
 *
 * Dinheiro (carteira e ganhos do motoboy) só com payout:view ou money:overview, como no detalhe do
 * pedido da D3b-1: sem a permissão, as chaves nem entram no objeto. CPF e chave Pix nunca saem (a
 * chave vira `hasPixKey`); o telefone sai só com os 4 últimos dígitos. Os nomes dos campos são os da P3
 * ("Contratos consumidos"; decisão 21).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { getSaasConfig } from '../../utils/settlement';
import { PermissionCheck, shortOrderId } from '../adminOps/common';
import { listTimeline } from './actions';
import { STAFF_ROLES, accountRoles } from './users';
import { STORE_SITUATION_SELECT, storeSituation } from './storeStatus';
import { requiredVerificationItems, verificationItem } from './userVerification';
import { allowedAudiences, canReachUser, familyKeys } from '../permissions/catalog';
import {
  DebtStatus,
  TimelineResponse,
  UserDetail,
  UserDetailMotoboy,
  UserDetailWallet,
  UserDetailWallets,
  UserVerificationEntry,
  UserVerificationKey,
  VerificationEntryStatus,
} from './types';

const DAY_MS = 86_400_000;
const ORDERS_IN_DETAIL = 20;
const VERIFICATION_KEYS: UserVerificationKey[] = ['email', 'document', 'facial', 'courier'];

const money = (v: unknown): number => Math.round(Number(v ?? 0) * 100) / 100;
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export interface UserDetailViewer {
  id: string;
  isCeo: boolean;
  can: PermissionCheck;
}

/** Mesma regra do detalhe do pedido (D3b-1): repasses com payout:view, partes com money:overview. */
export const canSeeMoney = (can: PermissionCheck): boolean => can('payout:view') || can('money:overview');

/** Os 4 últimos dígitos ("1234"; a tela põe "•••• 1234"). Menos de 4 dígitos (ou nenhum) = null. */
export function phoneLast4(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length < 4 ? null : digits.slice(-4);
}

/** Decisão 21: só o que espera o admin é `pending`; o e-mail confirmado (`verified`) é `approved`. */
function entryStatus(key: UserVerificationKey, raw: unknown): VerificationEntryStatus {
  if (key === 'email') return raw === 'verified' ? 'approved' : 'none';
  return raw === 'pending' || raw === 'approved' || raw === 'rejected' ? raw : 'none';
}

function jsonDate(v: unknown): string | null {
  if (typeof v !== 'string' && !(v instanceof Date)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** E-mail e documento sempre; facial e CNH quando o papel exige ou quando já foram enviados. */
function verificationEntries(json: unknown, required: UserVerificationKey[]): UserVerificationEntry[] {
  return VERIFICATION_KEYS
    .filter((k) => k === 'email' || k === 'document' || required.includes(k) || verificationItem(json, k) !== null)
    .map((k) => {
      const item = verificationItem(json, k) ?? {};
      return {
        kind: k,
        status: entryStatus(k, item.status),
        reason: text(item.rejectionReason),
        at: jsonDate(item.reviewedAt ?? item.verifiedAt ?? item.submittedAt),
      };
    });
}

function hasPixKey(asaas: unknown): boolean {
  const key = asaas && typeof asaas === 'object' && !Array.isArray(asaas) ? (asaas as Record<string, unknown>).pixKey : undefined;
  return typeof key === 'string' && key.trim().length > 0;
}

/** Repasses não cancelados (custódia) + Pix da loja de entrega (direto) das corridas dadas. */
async function ridesEarnings(motoboyId: string, deliveryIds: string[]): Promise<number> {
  if (deliveryIds.length === 0) return 0;
  const [payouts, transfers] = await Promise.all([
    prisma.payout.aggregate({
      where: { recipientType: 'motoboy', recipientId: motoboyId, deliveryId: { in: deliveryIds }, status: { not: 'cancelled' } },
      _sum: { amount: true },
    }),
    prisma.motoboyTransfer.aggregate({
      where: { motoboyId, deliveryId: { in: deliveryIds }, reason: 'delivery' },
      _sum: { amount: true },
    }),
  ]);
  return money(Number(payouts._sum.amount ?? 0) + Number(transfers._sum.amount ?? 0));
}

async function loadMotoboy(
  user: { id: string; verification: Prisma.JsonValue; asaas: Prisma.JsonValue },
  seeMoney: boolean,
  now: Date,
): Promise<UserDetailMotoboy> {
  const courier = verificationItem(user.verification, 'courier') ?? {};
  const rides = await prisma.delivery.findMany({
    where: { motoboyId: user.id, status: 'delivered', deliveredAt: { gte: new Date(now.getTime() - 30 * DAY_MS), lte: now } },
    select: { id: true },
  });
  const block: UserDetailMotoboy = {
    cnh: text(courier.cnhNumber),
    plate: text(courier.plate),
    courierStatus: typeof courier.status === 'string' ? courier.status : 'none',
    hasPixKey: hasPixKey(user.asaas),
    deliveries30d: rides.length,
  };
  if (!seeMoney) return block;
  return { ...block, earnings30d: await ridesEarnings(user.id, rides.map((r) => r.id)) };
}

/** Decisão 9: as duas carteiras da pessoa, separadas (compras = `user`, entregas = `motoboy`); null quando não existe. */
async function loadWallets(userId: string): Promise<UserDetailWallets> {
  const rows = await prisma.wallet.findMany({
    where: { owner: userId, ownerType: { in: ['user', 'motoboy'] } },
    select: { ownerType: true, balance: true, availableBalance: true, pendingBalance: true, blockedBalance: true },
  });
  const pick = (ownerType: 'user' | 'motoboy'): UserDetailWallet | null => {
    const w = rows.find((r) => r.ownerType === ownerType);
    return w
      ? { balance: money(w.balance), available: money(w.availableBalance), pending: money(w.pendingBalance), blocked: money(w.blockedBalance) }
      : null;
  };
  return { cliente: pick('user'), motoboy: pick('motoboy') };
}

const USER_DETAIL_SELECT = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  name: true,
  email: true,
  telefone: true,
  role: true,
  roles: true,
  activeRole: true,
  status: true,
  blockReason: true,
  blockedAt: true,
  blockedBy: true,
  verification: true,
  // Lido só para `hasPixKey`; o objeto nunca vai para a resposta.
  asaas: true,
  createdAt: true,
  lastSeenAt: true,
});

export async function getAdminUserDetail(userId: string, viewer: UserDetailViewer, now: Date = new Date()): Promise<UserDetail | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_DETAIL_SELECT });
  if (!user) return null;
  const roles = accountRoles(user);
  const seeMoney = canSeeMoney(viewer.can);

  const [cfg, orders, debts, blocker, stores, motoboy, wallets, timeline] = await Promise.all([
    getSaasConfig(),
    prisma.order.findMany({
      where: { customerId: user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ORDERS_IN_DETAIL,
      select: { id: true, status: true, totalValue: true, createdAt: true, store: { select: { id: true, name: true } } },
    }),
    prisma.customerDebt.findMany({ where: { customerId: user.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    user.blockedBy ? prisma.user.findUnique({ where: { id: user.blockedBy }, select: { name: true } }) : null,
    roles.includes('lojista')
      ? prisma.store.findMany({ where: { ownerId: user.id }, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { id: true, name: true, ...STORE_SITUATION_SELECT } })
      : null,
    roles.includes('motoboy') ? loadMotoboy(user, seeMoney, now) : null,
    seeMoney ? loadWallets(user.id) : null,
    listTimeline({ userId: user.id }),
  ]);

  const self = viewer.id === user.id;
  const targetIsStaff = roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r));
  const blocked = user.status === 'blocked';
  // Fix round 1: como em PUT /roles, só o CEO bloqueia, desbloqueia ou desconecta conta da equipe.
  // Por público (22/10): user:block vale para todos; user:edit_<público>, só para o público dele.
  const editAccess = allowedAudiences(familyKeys('userEdit').filter((k) => viewer.can(k)), 'userEdit');
  const canBlock = !self && canReachUser(editAccess, roles) && (viewer.isCeo || !targetIsStaff);

  return {
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      phoneLast4: phoneLast4(user.telefone),
      roles,
      activeRole: user.activeRole,
      status: user.status,
      block: blocked
        ? {
            reason: user.blockReason ?? null,
            at: iso(user.blockedAt),
            by: user.blockedBy ? { id: user.blockedBy, name: blocker?.name ?? null } : null,
          }
        : null,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: iso(user.lastSeenAt),
    },
    verification: verificationEntries(user.verification, requiredVerificationItems(roles, cfg.settlementMode)),
    orders: orders.map((o) => ({
      id: o.id,
      shortId: shortOrderId(o.id),
      status: o.status,
      total: money(o.totalValue),
      store: { id: o.store.id, name: o.store.name },
      createdAt: o.createdAt.toISOString(),
    })),
    debts: debts.map((d) => ({
      id: d.id,
      amount: money(d.amount),
      status: d.status as DebtStatus,
      reason: d.reason,
      sourceOrderId: d.sourceOrderId,
      createdAt: d.createdAt.toISOString(),
      collectedAt: iso(d.collectedAt),
      forgivenAt: iso(d.forgivenAt),
    })),
    ...(motoboy ? { motoboy } : {}),
    ...(stores ? { stores: stores.map((s) => ({ id: s.id, name: s.name, situation: storeSituation(s, now) })) } : {}),
    ...(wallets ? { wallets } : {}),
    timeline,
    can: {
      block: canBlock && !blocked,
      unblock: canBlock && blocked,
      disconnect: canBlock,
      roles: !self && viewer.can('user:manage_roles') && (viewer.isCeo || !targetIsStaff),
      // Ruling de 21/10: ninguém perdoa a própria dívida (a P1.3 responde 403 SELF_ACTION_FORBIDDEN).
      forgiveDebt: !self && viewer.can('user:debt_forgive'),
      note: true,
    },
  };
}

/** Uma página do histórico da pessoa; null quando a pessoa não existe. */
export async function userTimeline(userId: string, cursor?: string): Promise<TimelineResponse | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return null;
  return listTimeline({ userId, cursor });
}
