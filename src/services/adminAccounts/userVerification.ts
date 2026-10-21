/**
 * D3b-2a · verificação de uma pessoa: os itens que o papel exige e o resumo da lista (decisão 6).
 * Itens exigidos = os dos portões: clientVerification (e-mail e documento), courierVerification
 * (+ facial e CNH/placa) e storeVerification (o dono + facial, só na custódia). "pending" é só o que
 * espera o admin: e-mail ainda não confirmado conta como "none".
 */
import { SettlementMode } from '../../utils/settlement';
import { UserVerificationKey, VerificationSummary } from './types';

const APPROVED: Record<UserVerificationKey, string> = {
  email: 'verified',
  document: 'approved',
  facial: 'approved',
  courier: 'approved',
};

export function verificationItem(json: unknown, key: UserVerificationKey): Record<string, unknown> | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const item = (json as Record<string, unknown>)[key];
  return item && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>) : null;
}

export function verificationItemStatus(json: unknown, key: UserVerificationKey): string {
  const status = verificationItem(json, key)?.status;
  return typeof status === 'string' ? status : 'none';
}

export function requiredVerificationItems(roles: readonly string[], mode: SettlementMode): UserVerificationKey[] {
  if (roles.includes('motoboy')) return ['email', 'document', 'facial', 'courier'];
  if (roles.includes('lojista') && mode === 'custodia') return ['email', 'document', 'facial'];
  return ['email', 'document'];
}

export function summarizeVerification(json: unknown, roles: readonly string[], mode: SettlementMode): VerificationSummary {
  const items = requiredVerificationItems(roles, mode).map((key) => ({ key, status: verificationItemStatus(json, key) }));
  if (items.every((i) => i.status === APPROVED[i.key])) return 'ok';
  if (items.some((i) => i.status === 'rejected')) return 'rejected';
  if (items.some((i) => i.key !== 'email' && i.status === 'pending')) return 'pending';
  return 'none';
}
