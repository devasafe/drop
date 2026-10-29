/**
 * D3b-4a (spec 5.2): regras por campo de PUT /settings/platform-config. Texto numérico vira número,
 * fração arredonda a 2 casas, inteiro recusa fração; fora da faixa → RuleFieldError (400 INVALID_FIELD).
 * Colunas do PlatformConfig que não se editam aqui são ignoradas (aba velha manda a config inteira);
 * qualquer outra chave é recusada.
 */
import { Prisma, SeasonalTheme } from '@prisma/client';
import { RULE_REASON_MAX } from './ruleChanges';

export type RuleKind = 'percent' | 'money' | 'bigMoney' | 'minutes' | 'installments' | 'days' | 'hours';

const LIMITS: Record<RuleKind, { min: number; max: number; int: boolean; unit: string }> = {
  percent: { min: 0, max: 100, int: false, unit: '%' },
  money: { min: 0, max: 1000, int: false, unit: 'R$' },
  bigMoney: { min: 0, max: 100000, int: false, unit: 'R$' },
  minutes: { min: 1, max: 240, int: true, unit: 'min' },
  installments: { min: 1, max: 12, int: true, unit: 'parcelas' },
  days: { min: 1, max: 90, int: true, unit: 'dias' },
  hours: { min: 1, max: 240, int: true, unit: 'h' },
};

export const PLATFORM_CONFIG_RULES = {
  commissionPlan1: { label: 'Comissão do plano 1', kind: 'percent' },
  commissionPlan2: { label: 'Comissão do plano 2', kind: 'percent' },
  commissionPlan3: { label: 'Comissão do plano 3', kind: 'percent' },
  motoboyCutPerDelivery: { label: 'Taxa fixa por entrega', kind: 'money' },
  motoboyCutPerKm: { label: 'Valor por km', kind: 'money' },
  motoboyCommissionPercent: { label: 'Parte do DROP na entrega', kind: 'percent' },
  motoboyMinimumWithdraw: { label: 'Saque mínimo do motoboy', kind: 'bigMoney' },
  storeMinimumWithdraw: { label: 'Saque mínimo da loja', kind: 'bigMoney' },
  minOrderValue: { label: 'Pedido mínimo', kind: 'money' },
  lateCancellationFeePercent: { label: 'Multa por cancelamento tardio', kind: 'percent' },
  lateCancellationMotoboyShare: { label: 'Parte da multa para o motoboy', kind: 'percent' },
  cancelFeeCustomerPercent: { label: 'Cancelamento do cliente', kind: 'percent' },
  cancelFeeStorePercent: { label: 'Cancelamento da loja', kind: 'percent' },
  cancelFeeMotoboyPercent: { label: 'Cancelamento do motoboy', kind: 'percent' },
  storeAcceptTimeoutMin: { label: 'Prazo para a loja aceitar', kind: 'minutes' },
  poolTimeoutMin: { label: 'Prazo para achar motoboy', kind: 'minutes' },
  customerAbsentWaitMin: { label: 'Espera pelo cliente ausente', kind: 'minutes' },
  returnFullRefundDays: { label: 'Arrependimento com valor integral', kind: 'days' },
  returnStoreResponseHours: { label: 'Resposta da loja ao reembolso', kind: 'hours' },
  cardFeePercent: { label: 'Taxa do cartão (%)', kind: 'percent' },
  cardFeeFixed: { label: 'Taxa fixa do cartão', kind: 'money' },
  cardAnticipationMonthlyRate: { label: 'Juros da antecipação', kind: 'percent' },
  cardInstallmentMaxCount: { label: 'Parcelas máximas', kind: 'installments' },
  cardInstallmentMinValue: { label: 'Valor mínimo da parcela', kind: 'bigMoney' },
} as const satisfies Record<string, { label: string; kind: RuleKind }>;

export type PlatformConfigRuleField = keyof typeof PLATFORM_CONFIG_RULES;

/** Campos de PUT /admin/switches que entram no histórico (mesma lista do switchesSchema). */
export const SWITCH_HISTORY_FIELDS = [
  'rankingPrizesEnabled', 'benefitsRedeemEnabled', 'gamificationPointsEnabled', 'settlementMode', 'billingModel',
  'motoboyShareDirect', 'directCardEnabled', 'transferBlockHours', 'saasMonthlyFee', 'saasTrialDays', 'saasGraceDays',
  'directTransfersEnabled', 'defaultDeliveryRadiusKm', 'defaultPrepMinutes', 'courierAvgSpeedKmh', 'routeDetourFactor',
] as const;

export const RULE_HISTORY_FIELDS: readonly string[] = [
  ...Object.keys(PLATFORM_CONFIG_RULES), 'seasonalTheme', ...SWITCH_HISTORY_FIELDS,
];

export class RuleFieldError extends Error {
  readonly status = 400;
  constructor(readonly field: string, message: string, readonly code: string = 'INVALID_FIELD') {
    super(message);
  }
}

const fmt = (n: number) => n.toLocaleString('pt-BR');
const MIN_WITHDRAW = new Set(['motoboyMinimumWithdraw', 'storeMinimumWithdraw']);
const COMMISSION = new Set(['commissionPlan1', 'commissionPlan2', 'commissionPlan3']);

function rangeError(field: PlatformConfigRuleField): RuleFieldError {
  if (MIN_WITHDRAW.has(field)) {
    return new RuleFieldError(field, 'O saque mínimo precisa ser um valor entre R$ 0 e R$ 100.000', 'INVALID_MINIMUM_WITHDRAW');
  }
  if (COMMISSION.has(field)) return new RuleFieldError(field, 'A comissão precisa ser um número entre 0 e 100');
  const { label, kind } = PLATFORM_CONFIG_RULES[field];
  const l = LIMITS[kind];
  const range = l.unit === 'R$' ? `R$ ${fmt(l.min)} e R$ ${fmt(l.max)}` : `${fmt(l.min)} e ${fmt(l.max)} ${l.unit}`;
  return new RuleFieldError(field, `${label}: use ${l.int ? 'um número inteiro' : 'um valor'} entre ${range}`);
}

function parseRuleNumber(field: PlatformConfigRuleField, raw: unknown): number {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw rangeError(field);
  const l = LIMITS[PLATFORM_CONFIG_RULES[field].kind];
  if (l.int && !Number.isInteger(n)) throw rangeError(field);
  const v = l.int ? n : Math.round((n + Number.EPSILON) * 100) / 100;
  if (v < l.min || v > l.max) throw rangeError(field);
  return v;
}

const CONFIG_COLUMNS = new Set<string>([...Object.values(Prisma.PlatformConfigScalarFieldEnum), '_id']);
const THEMES = Object.values(SeasonalTheme) as string[];

export function parsePlatformConfigBody(body: unknown): {
  patch: Record<string, number | string>;
  commissionSync: unknown;
  changeReason: string | null;
} {
  const input = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const patch: Record<string, number | string> = {};
  let changeReason: string | null = null;
  for (const [key, raw] of Object.entries(input)) {
    if (raw === undefined) continue;
    if (Object.prototype.hasOwnProperty.call(PLATFORM_CONFIG_RULES, key)) {
      patch[key] = parseRuleNumber(key as PlatformConfigRuleField, raw);
    } else if (key === 'seasonalTheme') {
      if (typeof raw !== 'string' || !THEMES.includes(raw)) throw new RuleFieldError(key, 'Tema sazonal inválido');
      patch[key] = raw;
    } else if (key === 'changeReason') {
      if (raw !== null && typeof raw !== 'string') throw new RuleFieldError(key, 'Motivo inválido');
      if (typeof raw === 'string' && raw.trim().length > RULE_REASON_MAX) {
        throw new RuleFieldError(key, `O motivo pode ter até ${RULE_REASON_MAX} caracteres`);
      }
      changeReason = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    } else if (key === 'commissionSync') {
      // validado no controller, como hoje
    } else if (!CONFIG_COLUMNS.has(key)) {
      throw new RuleFieldError(key, `Campo desconhecido: ${key}`);
    }
  }
  return { patch, commissionSync: input.commissionSync, changeReason };
}
