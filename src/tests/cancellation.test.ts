import { calculateLateCancellationFee } from '../utils/walletCalculations';

// ============================================================
// Testes unitários: calculateLateCancellationFee
// ============================================================

describe('calculateLateCancellationFee', () => {
  const defaultConfig = {
    lateCancellationFeePercent: 10,    // 10% do total do pedido
    lateCancellationMotoboyShare: 50,  // 50% da taxa vai ao motoboy
  };

  // -------- Cliente cancela --------
  describe('cancelledBy: customer', () => {
    it('calcula totalFee correto (10% do pedido)', () => {
      const { totalFee } = calculateLateCancellationFee(200, defaultConfig, 'customer');
      expect(totalFee).toBe(20);
    });

    it('divide a taxa corretamente entre motoboy e app', () => {
      const { motoboyShare, appShare } = calculateLateCancellationFee(200, defaultConfig, 'customer');
      expect(motoboyShare).toBe(10); // 50% de 20
      expect(appShare).toBe(10);    // 50% de 20
    });

    it('motoboyShare + appShare === totalFee (sem perda de centavos)', () => {
      const { totalFee, motoboyShare, appShare } = calculateLateCancellationFee(333, defaultConfig, 'customer');
      expect(motoboyShare + appShare).toBeCloseTo(totalFee, 10);
    });
  });

  // -------- Loja cancela --------
  describe('cancelledBy: store', () => {
    it('aplica a mesma lógica de divisão do cliente', () => {
      const result = calculateLateCancellationFee(200, defaultConfig, 'store');
      expect(result.totalFee).toBe(20);
      expect(result.motoboyShare).toBe(10);
      expect(result.appShare).toBe(10);
    });
  });

  // -------- Motoboy cancela --------
  describe('cancelledBy: motoboy', () => {
    it('motoboyShare é 0 (motoboy não recebe share de si mesmo)', () => {
      const { motoboyShare } = calculateLateCancellationFee(200, defaultConfig, 'motoboy');
      expect(motoboyShare).toBe(0);
    });

    it('appShare recebe 100% da taxa', () => {
      const { totalFee, appShare } = calculateLateCancellationFee(200, defaultConfig, 'motoboy');
      expect(appShare).toBe(totalFee);
      expect(appShare).toBe(20);
    });
  });

  // -------- Casos de borda --------
  describe('casos de borda', () => {
    it('feePercent = 0 → sem taxa cobrada', () => {
      const config = { ...defaultConfig, lateCancellationFeePercent: 0 };
      const { totalFee, motoboyShare, appShare } = calculateLateCancellationFee(200, config, 'customer');
      expect(totalFee).toBe(0);
      expect(motoboyShare).toBe(0);
      expect(appShare).toBe(0);
    });

    it('motoboyShare = 100 → app não recebe nada (exceto quando motoboy cancela)', () => {
      const config = { ...defaultConfig, lateCancellationMotoboyShare: 100 };
      const { motoboyShare, appShare } = calculateLateCancellationFee(200, config, 'customer');
      expect(motoboyShare).toBe(20);
      expect(appShare).toBe(0);
    });

    it('motoboyShare = 0 → motoboy não recebe nada quando cliente cancela', () => {
      const config = { ...defaultConfig, lateCancellationMotoboyShare: 0 };
      const { motoboyShare, appShare } = calculateLateCancellationFee(200, config, 'customer');
      expect(motoboyShare).toBe(0);
      expect(appShare).toBe(20);
    });

    it('motoboyShare = 0 e motoboy cancela → motoboy ainda não recebe nada', () => {
      const config = { ...defaultConfig, lateCancellationMotoboyShare: 0 };
      const { motoboyShare, appShare } = calculateLateCancellationFee(200, config, 'motoboy');
      expect(motoboyShare).toBe(0);
      expect(appShare).toBe(20);
    });

    it('orderTotal = 0 → taxa zerada', () => {
      const { totalFee } = calculateLateCancellationFee(0, defaultConfig, 'customer');
      expect(totalFee).toBe(0);
    });
  });
});
