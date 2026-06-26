import { getFlow, getStepIndexByPath, getNextStep, getFinalDestination } from '../onboardingFlow';

describe('onboardingFlow', () => {
  test('tamanho do fluxo por papel', () => {
    expect(getFlow('cliente')).toHaveLength(1);
    expect(getFlow('motoboy')).toHaveLength(3);
    expect(getFlow('lojista')).toHaveLength(4);
    expect(getFlow(undefined)).toEqual([]);
    expect(getFlow('admin')).toEqual([]);
  });

  test('motoboy começa pela verificação usual de conta', () => {
    expect(getFlow('motoboy')[0].path).toBe('/verificacao');
    expect(getNextStep('motoboy', '/verificacao')?.path).toBe('/verificacao-motoboy');
    expect(getNextStep('motoboy', '/verificacao-motoboy')?.path).toBe('/dados-recebimento');
  });

  test('getNextStep retorna null na última etapa', () => {
    expect(getNextStep('lojista', '/seller/select-plan')).toBeNull();
    expect(getNextStep('motoboy', '/dados-recebimento')).toBeNull();
    expect(getNextStep('cliente', '/verificacao')).toBeNull();
  });

  test('getNextStep retorna null para rota fora do fluxo', () => {
    expect(getNextStep('lojista', '/rota-inexistente')).toBeNull();
  });

  test('getStepIndexByPath', () => {
    expect(getStepIndexByPath('lojista', '/verificacao-loja')).toBe(1);
    expect(getStepIndexByPath('lojista', '/rota-inexistente')).toBe(-1);
  });

  test('getFinalDestination por papel', () => {
    expect(getFinalDestination('cliente')).toBe('/');
    expect(getFinalDestination('motoboy')).toBe('/motoboy');
    expect(getFinalDestination('lojista')).toBe('/seller/dashboard');
    expect(getFinalDestination(undefined)).toBe('/');
  });
});
