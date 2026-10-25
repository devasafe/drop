/**
 * D3b-4a: rótulo, unidade e faixa de cada campo de regra (mesmas faixas do servidor,
 * src/services/rules/platformConfigRules.ts). Usado pela aba Taxas e pela aba Histórico.
 */
import { formatMoney } from './money';

export type RuleUnit = 'money' | 'percent' | 'minutes' | 'count' | 'days' | 'hours' | 'km' | 'kmh' | 'factor' | 'bool' | 'text';
export interface RuleFieldInfo { label: string; unit: RuleUnit; min?: number; max?: number; int?: boolean }

const pct = (label: string): RuleFieldInfo => ({ label, unit: 'percent', min: 0, max: 100 });
const money = (label: string, max = 1000): RuleFieldInfo => ({ label, unit: 'money', min: 0, max });
const mins = (label: string): RuleFieldInfo => ({ label, unit: 'minutes', min: 1, max: 240, int: true });

export const RULE_FIELDS: Record<string, RuleFieldInfo> = {
  commissionPlan1: pct('Comissão do plano 1'),
  commissionPlan2: pct('Comissão do plano 2'),
  commissionPlan3: pct('Comissão do plano 3'),
  motoboyCutPerDelivery: money('Taxa fixa por entrega'),
  motoboyCutPerKm: money('Valor por km'),
  motoboyCommissionPercent: pct('Parte do DROP na entrega'),
  motoboyMinimumWithdraw: money('Saque mínimo do motoboy', 100000),
  storeMinimumWithdraw: money('Saque mínimo da loja', 100000),
  lateCancellationFeePercent: pct('Multa por cancelamento tardio'),
  lateCancellationMotoboyShare: pct('Parte da multa para o motoboy'),
  cancelFeeCustomerPercent: pct('Cancelamento do cliente'),
  cancelFeeStorePercent: pct('Cancelamento da loja'),
  cancelFeeMotoboyPercent: pct('Cancelamento do motoboy'),
  storeAcceptTimeoutMin: mins('Prazo para a loja aceitar'),
  poolTimeoutMin: mins('Prazo para achar motoboy'),
  customerAbsentWaitMin: mins('Espera pelo cliente ausente'),
  returnFullRefundDays: { label: 'Arrependimento com valor integral', unit: 'days', min: 1, max: 90, int: true },
  returnStoreResponseHours: { label: 'Resposta da loja ao reembolso', unit: 'hours', min: 1, max: 240, int: true },
  cardFeePercent: pct('Taxa do cartão (%)'),
  cardFeeFixed: money('Taxa fixa do cartão'),
  cardAnticipationMonthlyRate: pct('Juros da antecipação'),
  cardInstallmentMaxCount: { label: 'Parcelas máximas', unit: 'count', min: 1, max: 12, int: true },
  cardInstallmentMinValue: money('Valor mínimo da parcela', 100000),
  seasonalTheme: { label: 'Tema sazonal', unit: 'text' },
  rankingPrizesEnabled: { label: 'Prêmios do ranking', unit: 'bool' },
  benefitsRedeemEnabled: { label: 'Resgate de benefícios', unit: 'bool' },
  gamificationPointsEnabled: { label: 'Pontos de gamificação', unit: 'bool' },
  settlementMode: { label: 'Modo da plataforma', unit: 'text' },
  billingModel: { label: 'Modelo de cobrança', unit: 'text' },
  motoboyShareDirect: pct('Parte do motoboy no direto'),
  directCardEnabled: { label: 'Cartão no modo direto', unit: 'bool' },
  transferBlockHours: { label: 'Bloqueio de repasse', unit: 'hours' },
  saasMonthlyFee: money('Mensalidade padrão', 100000),
  saasTrialDays: { label: 'Dias de teste', unit: 'days' },
  saasGraceDays: { label: 'Dias de tolerância', unit: 'days' },
  directTransfersEnabled: { label: 'Pix automático ao motoboy', unit: 'bool' },
  defaultDeliveryRadiusKm: { label: 'Raio de entrega padrão', unit: 'km' },
  defaultPrepMinutes: { label: 'Preparo padrão', unit: 'minutes' },
  courierAvgSpeedKmh: { label: 'Velocidade média do motoboy', unit: 'kmh' },
  routeDetourFactor: { label: 'Fator de desvio da rota', unit: 'factor' },
};

const TEXT_LABEL: Record<string, string> = {
  custodia: 'Custódia (App)', direto: 'Direto',
  mensalidade: 'Mensalidade', comissao: 'Comissão', ambos: 'Mensalidade e comissão',
  none: 'Nenhum', natal: 'Natal', pascoa: 'Páscoa', junina: 'Festa junina', halloween: 'Halloween',
};

const n2 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export const ruleFieldLabel = (field: string) => RULE_FIELDS[field]?.label ?? field;

export function formatRuleValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const unit = RULE_FIELDS[field]?.unit ?? 'text';
  if (unit === 'bool') return value ? 'Ligado' : 'Desligado';
  if (unit === 'text') return TEXT_LABEL[String(value)] ?? String(value);
  const v = Number(value);
  if (!Number.isFinite(v)) return String(value);
  switch (unit) {
    case 'money': return formatMoney(v);
    case 'percent': return `${n2(v)}%`;
    case 'minutes': return `${n2(v)} min`;
    case 'days': return `${n2(v)} dias`;
    case 'hours': return `${n2(v)} h`;
    case 'km': return `${n2(v)} km`;
    case 'kmh': return `${n2(v)} km/h`;
    case 'factor': return `${n2(v)}×`;
    default: return n2(v);
  }
}

const SP_SHORT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

/** "22/10 14:03" em horário de São Paulo (sem a vírgula que alguns ICU colocam). */
export const spShortDateTime = (iso: string): string => SP_SHORT.format(new Date(iso)).replace(',', '');
