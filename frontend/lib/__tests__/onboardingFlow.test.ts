import { getFlow, getStepIndexByPath, getNextStep, getFinalDestination } from '../onboardingFlow';

describe('onboardingFlow', () => {
  test('tamanho do fluxo por papel', () => {
    expect(getFlow('cliente')).toHaveLength(1);
    expect(getFlow('motoboy')).toHaveLength(4);
    expect(getFlow('lojista')).toHaveLength(5);
    expect(getFlow(undefined)).toEqual([]);
    expect(getFlow('admin')).toEqual([]);
  });

  test('motoboy começa pela verificação usual de conta', () => {
    expect(getFlow('motoboy')[0].path).toBe('/verificacao');
    expect(getNextStep('motoboy', '/verificacao')?.path).toBe('/verificacao-motoboy');
    expect(getNextStep('motoboy', '/verificacao-motoboy')?.path).toBe('/foto-perfil');
    expect(getNextStep('motoboy', '/foto-perfil')?.path).toBe('/dados-recebimento');
  });

  test('lojista começa pela criação da loja', () => {
    expect(getFlow('lojista')[0].path).toBe('/seller/create-store');
    expect(getFlow('lojista')[1].path).toBe('/verificacao');
    expect(getNextStep('lojista', '/seller/create-store')?.path).toBe('/verificacao');
    expect(getNextStep('lojista', '/verificacao')?.path).toBe('/verificacao-loja');
    expect(getNextStep('lojista', '/verificacao-loja')?.path).toBe('/dados-recebimento');
    expect(getNextStep('lojista', '/dados-recebimento')?.path).toBe('/seller/select-plan');
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
    expect(getStepIndexByPath('lojista', '/seller/create-store')).toBe(0);
    expect(getStepIndexByPath('lojista', '/verificacao-loja')).toBe(2);
    expect(getStepIndexByPath('lojista', '/rota-inexistente')).toBe(-1);
  });

  test('getFinalDestination por papel', () => {
    expect(getFinalDestination('cliente')).toBe('/');
    expect(getFinalDestination('motoboy')).toBe('/motoboy');
    expect(getFinalDestination('lojista')).toBe('/seller/dashboard');
    expect(getFinalDestination(undefined)).toBe('/');
  });
});
