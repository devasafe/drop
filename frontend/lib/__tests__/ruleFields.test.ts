import { RULE_FIELDS, formatRuleValue, ruleFieldLabel } from '../ruleFields';

test('formata cada unidade', () => {
  expect(formatRuleValue('motoboyCutPerKm', 1.2)).toBe('R$ 1,20');
  expect(formatRuleValue('cardFeePercent', 2.99)).toBe('2,99%');
  expect(formatRuleValue('poolTimeoutMin', 15)).toBe('15 min');
  expect(formatRuleValue('cardInstallmentMaxCount', 12)).toBe('12');
  expect(formatRuleValue('saasTrialDays', 14)).toBe('14 dias');
  expect(formatRuleValue('transferBlockHours', 24)).toBe('24 h');
  expect(formatRuleValue('defaultDeliveryRadiusKm', 12)).toBe('12 km');
  expect(formatRuleValue('courierAvgSpeedKmh', 25)).toBe('25 km/h');
  expect(formatRuleValue('routeDetourFactor', 1.3)).toBe('1,3×');
  expect(formatRuleValue('directCardEnabled', true)).toBe('Ligado');
  expect(formatRuleValue('settlementMode', 'direto')).toBe('Direto');
  expect(formatRuleValue('seasonalTheme', 'natal')).toBe('Natal');
  expect(formatRuleValue('cardFeeFixed', 0)).toBe('R$ 0,00');
  expect(formatRuleValue('cardFeeFixed', null)).toBe('—');
});

test('rótulo e faixas', () => {
  expect(ruleFieldLabel('lateCancellationMotoboyShare')).toBe('Parte da multa para o motoboy');
  expect(ruleFieldLabel('desconhecido')).toBe('desconhecido');
  expect(RULE_FIELDS.poolTimeoutMin).toMatchObject({ min: 1, max: 240, int: true });
  expect(RULE_FIELDS.cardInstallmentMaxCount).toMatchObject({ min: 1, max: 12, int: true });
  expect(RULE_FIELDS.cardFeeFixed).toMatchObject({ min: 0, max: 1000 });
});
