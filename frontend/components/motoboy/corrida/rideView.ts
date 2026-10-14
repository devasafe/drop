// Regras puras da tela da corrida (/motoboy/corrida/[id]). Nada aqui lê rede nem relógio sozinho.
import { shortOrderCode } from '../../../lib/customerOrder';
import { parseCoords, type LatLng } from '../../../lib/geo';

export type RideStage = 'retirar' | 'entregar' | 'devolver' | 'cancelada' | 'concluida' | 'outra';

/** Etapa da tela a partir do payload do servidor. A devolução pendente (com código) vence o status. */
export function rideStage(r: any): RideStage {
  if (!r) return 'outra';
  if (r.statusDevolucao === 'aguardando_confirmacao' && r.pinDevolucao) return 'devolver';
  switch (r.status) {
    case 'assigned': return 'retirar';
    case 'picked': return 'entregar';
    case 'delivered': return 'concluida';
    case 'cancelled': return 'cancelada';
    default: return 'outra';
  }
}

const RANK: Record<string, number> = { assigned: 1, picked: 2, delivered: 3, cancelled: 3 };
const TERMINAL = new Set(['delivered', 'cancelled']);

/** Campos que uma leitura atrasada não pode apagar: horas das etapas, compensação e motivo. */
const STICKY_FIELDS = [
  'assignedAt', 'pickedAt', 'deliveredAt', 'cancelledAt', 'customerAbsentAvailableAt',
  'cancellationCompensation', 'reason', 'cancelReason',
];

/**
 * Junta a leitura nova com a atual. Uma leitura atrasada (GET em voo quando o socket já disse
 * "retirado") nunca volta a corrida de etapa nem apaga o que já se sabia: fica o status atual e
 * os campos de STICKY_FIELDS não nulos do atual. É atrasada a leitura com etapa menor, com status
 * desconhecido (fora do RANK) quando o atual é conhecido, ou com outro terminal quando o atual já
 * é terminal. Fora disso, tudo vem da leitura nova.
 */
export function mergeRide(prev: any, next: any): any {
  if (!prev || !next) return next;
  const p = RANK[prev.status] ?? 0;
  const n = RANK[next.status] ?? 0;
  const stale = p > 0 && (
    n === 0
    || n < p
    || (TERMINAL.has(prev.status) && TERMINAL.has(next.status) && prev.status !== next.status)
  );
  if (!stale) return next;
  const out = { ...next, status: prev.status };
  for (const k of STICKY_FIELDS) {
    if (prev[k] !== null && prev[k] !== undefined) out[k] = prev[k];
  }
  return out;
}

export const PICKUP_LATE_MIN = 10;

function time(iso: unknown): number | null {
  if (iso === null || iso === undefined || iso === '') return null;
  const t = new Date(iso as string).getTime();
  return Number.isNaN(t) ? null : t;
}

export function msSince(iso: unknown, now: number): number | null {
  const t = time(iso);
  return t === null ? null : Math.max(0, now - t);
}

export function minutesSince(iso: unknown, now: number): number | null {
  const ms = msSince(iso, now);
  return ms === null ? null : Math.floor(ms / 60_000);
}

/** Quanto falta para o servidor aceitar "cliente ausente". null = o servidor não deu a hora. */
export function absentRemainingMs(availableAt: unknown, now: number): number | null {
  const t = time(availableAt);
  return t === null ? null : Math.max(0, t - now);
}

export function mapsUrl(p: LatLng | null | undefined): string | null {
  if (!p) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
}

export function telHref(phone: unknown): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? `tel:${digits}` : null;
}

export function rideCode(r: any): string {
  return shortOrderCode(String(r?.orderId || r?.order?._id || r?._id || ''));
}

export function itemsLine(order: any): string {
  const items: any[] = Array.isArray(order?.products) ? order.products : [];
  if (items.length === 0) return '';
  const qty = items.reduce((s, it) => s + (Number(it?.quantity) || 0), 0);
  const names = items.map((it) => String(it?.productName || it?.name || '').trim()).filter(Boolean);
  const list = names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  return `${qty} ${qty === 1 ? 'item' : 'itens'}${list ? ` (${list})` : ''}`;
}

export function storePoint(r: any): LatLng | null {
  return parseCoords(r?.storeLatitude, r?.storeLongitude) || parseCoords(r?.storeObj?.latitude, r?.storeObj?.longitude);
}

export function customerPoint(r: any): LatLng | null {
  return parseCoords(r?.deliveryLat, r?.deliveryLng) || parseCoords(r?.customerLatitude, r?.customerLongitude);
}

export type MoneyTone = 'ok' | 'warn' | 'err' | 'info';

/** Status reais de MotoboyTransfer (modo direto): quem envia o Pix é a loja. */
export function transferStatusLabel(status: string): { label: string; tone: MoneyTone } {
  switch (status) {
    case 'done': return { label: 'Na conta', tone: 'ok' };
    case 'failed': return { label: 'Atrasado · a loja vai tentar de novo', tone: 'warn' };
    case 'uncertain': return { label: 'Em conferência pela DROP', tone: 'warn' };
    case 'failed_final': return { label: 'Com a DROP', tone: 'err' };
    default: return { label: 'Enviando', tone: 'info' };
  }
}
