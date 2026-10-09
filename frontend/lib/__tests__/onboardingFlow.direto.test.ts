import { getFlow, getNextStep, getStepIndexByPath } from '../onboardingFlow';

describe('onboardingFlow no modo direto (SaaS)', () => {
  test('lojista tem 3 etapas: loja, identidade, conta Asaas', () => {
    expect(getFlow('lojista', 'direto')).toEqual([
      { key: 'loja', label: 'Criar loja', path: '/seller/create-store' },
      { key: 'identidade', label: 'Sua identidade', path: '/verificacao' },
      { key: 'asaas', label: 'Conta Asaas', path: '/seller/pagamentos' },
    ]);
  });

  test('getNextStep encadeia identidade -> pagamentos e a última etapa devolve null', () => {
    expect(getNextStep('lojista', '/seller/create-store', 'direto')?.path).toBe('/verificacao');
    expect(getNextStep('lojista', '/verificacao', 'direto')?.path).toBe('/seller/pagamentos');
    expect(getNextStep('lojista', '/seller/pagamentos', 'direto')).toBeNull();
  });

  test('etapas de verificação de loja/pix/plano não pertencem ao fluxo direto', () => {
    expect(getStepIndexByPath('lojista', '/verificacao-loja', 'direto')).toBe(-1);
    expect(getStepIndexByPath('lojista', '/dados-recebimento', 'direto')).toBe(-1);
    expect(getStepIndexByPath('lojista', '/seller/select-plan', 'direto')).toBe(-1);
    expect(getStepIndexByPath('lojista', '/seller/pagamentos', 'direto')).toBe(2);
  });

  test('custódia (default) continua com 5 etapas', () => {
    expect(getFlow('lojista')).toHaveLength(5);
    expect(getFlow('lojista', 'custodia')).toHaveLength(5);
  });

  test('motoboy e cliente iguais nos dois modos', () => {
    for (const role of ['motoboy', 'cliente']) {
      expect(getFlow(role, 'direto')).toEqual(getFlow(role, 'custodia'));
    }
  });
});
