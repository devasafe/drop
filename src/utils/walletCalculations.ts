import Store from '../models/Store';
import User from '../models/User';
import PricingPlan from '../models/PricingPlan';
import PlatformConfig from '../models/PlatformConfig';
import StoreSubscription from '../models/StoreSubscription';

/**
 * Arredonda valores monetários para 2 casas decimais (centavos).
 * Evita erros de ponto flutuante (ex.: 0.1 + 0.2) que quebram conferências
 * financeiras como a "soma exata" no saque (payout.service.selectPayoutsForAmount).
 */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Busca a taxa da loja conforme seu plano
 * Procura em StoreSubscription primeiro (atual), depois em User.planId (legado)
 */
export async function getStorePlanFee(storeId: string): Promise<number> {
  try {
    // 1️⃣ Primeiro, tenta buscar StoreSubscription (modelo atual)
    const subscription = await StoreSubscription.findOne({ storeId });
    if (subscription && subscription.commissionRate !== undefined) {
      console.log(`📊 [getStorePlanFee] StoreSubscription ${storeId} - Plano: ${subscription.currentPlan}, Comissão: ${subscription.commissionRate}%`);
      return subscription.commissionRate;
    }

    // 2️⃣ Se não encontrou, procura User (lojista) pelo planId
    const user = await User.findById(storeId).populate('planId');
    if (user && user.planId) {
      const plan = await PricingPlan.findById(user.planId);
      if (plan) {
        console.log(`📊 [getStorePlanFee] Lojista ${storeId} - Plano: ${plan.name}, Comissão: ${plan.commission}%`);
        return plan.commission || 0;
      }
    }

    // 3️⃣ Se não encontrou, tenta pelo Store (legacy)
    const store = await Store.findById(storeId);
    if (!store) throw new Error('Loja não encontrada');

    // Se houver customFee (caso especial), usa ela
    if (store.customCommissionRate !== undefined) {
      console.log(`📊 [getStorePlanFee] Store ${storeId} - Custom Fee: ${store.customCommissionRate}%`);
      return store.customCommissionRate;
    }

    // 4️⃣ Usa a comissão configurada pelo admin na tela "Comissões por Plano"
    // (PricingPlan), mapeando o número do plano da loja para o nome do plano.
    const PLAN_NAMES: { [key: number]: string } = {
      1: 'Plano 1 (Marketplace Only)',
      2: 'Plano 2 (Marketplace + Motoboys)',
      3: 'Plano 3 (Premium)',
    };
    const planName = PLAN_NAMES[store.plan || 1];
    if (planName) {
      const pricingPlan = await PricingPlan.findOne({ name: planName });
      if (pricingPlan && pricingPlan.commission != null) {
        console.log(`📊 [getStorePlanFee] Store ${storeId} - PricingPlan "${planName}": ${pricingPlan.commission}%`);
        return pricingPlan.commission;
      }
    }

    // 5️⃣ Último recurso: fallback fixo
    const planFees: { [key: number]: number } = {
      1: 10,   // ✅ Plano 1 (fallback)
      2: 15,   // ✅ Plano 2 (fallback)
      3: 20    // ✅ Plano 3 (fallback)
    };

    const fee = planFees[store.plan || 1] || 10;
    console.log(`📊 [getStorePlanFee] Store ${storeId} - Fallback Fee: ${fee}% (planId: ${store.plan})`);
    return fee;
  } catch (error) {
    // ⚠️ NUNCA retornar 0% silenciosamente — isso faria a plataforma deixar de
    // cobrar comissão. Propagar o erro para abortar o pedido (fail-safe financeiro).
    console.error('❌ Erro ao buscar taxa do plano:', error);
    throw error instanceof Error ? error : new Error('Falha ao buscar taxa do plano da loja');
  }
}

/**
 * Calcula quanto o motoboy ganha por uma entrega
 * Base: R$ 7.00
 * Adicional: R$ 1.00 por km
 * Bônus: R$ 1.00 (rating 3.5-4.4) ou R$ 2.00 (rating >= 4.5)
 */
export function calculateMotoboyEarnings(
  distanceKm: number,
  rating?: number
): number {
  const baseValue = 7.0;
  const perKmValue = 1.0;
  const distanceEarning = distanceKm * perKmValue;

  let ratingBonus = 0;
  if (rating) {
    if (rating >= 4.5) {
      ratingBonus = 2.0;
    } else if (rating >= 3.5) {
      ratingBonus = 1.0;
    }
  }

  return baseValue + distanceEarning + ratingBonus;
}

/**
 * ✅ NOVO: Calcula ganho do motoboy usando configurações globais
 * Busca valores do PlatformConfig (actualizados pelo CEO)
 */
export async function calculateMotoboyEarningsWithConfig(
  distanceKm: number,
  rating?: number
): Promise<number> {
  try {
    const config = await PlatformConfig.findOne();
    const baseValue = config?.motoboyCutPerDelivery || 5;
    const perKmValue = config?.motoboyCutPerKm || 1;
    const distanceEarning = distanceKm * perKmValue;

    let ratingBonus = 0;
    if (rating) {
      if (rating >= 4.5) {
        ratingBonus = 2.0;
      } else if (rating >= 3.5) {
        ratingBonus = 1.0;
      }
    }

    return baseValue + distanceEarning + ratingBonus;
  } catch (err) {
    console.error('❌ Erro ao calcular ganho do motoboy com config:', err);
    // Fall back to hardcoded values
    return calculateMotoboyEarnings(distanceKm, rating);
  }
}

/**
 * ✅ NOVO: Calcula taxa de entrega usando configurações globais
 */
export async function calculateDeliveryFeeWithConfig(distanceKm: number): Promise<number> {
  try {
    const config = await PlatformConfig.findOne();
    const base = config?.motoboyCutPerDelivery || 5;
    const perKm = config?.motoboyCutPerKm || 1;
    return base + perKm * Math.max(0, distanceKm);
  } catch (err) {
    console.error('❌ Erro ao calcular taxa de entrega com config:', err);
    // Fall back to hardcoded values
    return 5 + 1 * Math.max(0, distanceKm);
  }
}

/**
 * ✨ NOVO: Calcula a distribuição de valores incluindo comissão do motoboy para o app
 * 
 * FLUXO:
 * - Cliente paga: PRODUTO + TAXA ENTREGA
 * - Loja recebe: PRODUTO - % comissão plano
 * - App recebe: % comissão plano do PRODUTO + % comissão do MOTOBOY
 * - Motoboy recebe: TAXA ENTREGA - % comissão motoboy
 * 
 * Exemplo:
 * - Produto: 100 | Entrega: 10
 * - Comissão plano: 15% | Comissão motoboy: 20%
 * - Loja: 100 * (1 - 0.15) = 85
 * - App: (100 * 0.15) + (10 * 0.20) = 15 + 2 = 17
 * - Motoboy: 10 * (1 - 0.20) = 8
 */
export async function calculateOrderDistribution(
  productTotal: number,
  deliveryFeeTotal: number,
  storeId: string,
  distanceKm?: number,
  motoboyRating?: number
) {
  try {
    const config = await PlatformConfig.findOne();
    const planCommissionPercent = await getStorePlanFee(storeId);
    const planCommissionDecimal = planCommissionPercent / 100;
    const motoboyCommissionPercent = config?.motoboyCommissionPercent || 20;
    const motoboyCommissionDecimal = motoboyCommissionPercent / 100;

    // ✅ [Plan1] Verificar se a loja é Plano 1 (Vitrine): sem entrega integrada
    const store = await Store.findById(storeId).select('plan').lean();
    const storePlan = (store as any)?.plan ?? 2;
    let effectiveDeliveryFee = deliveryFeeTotal;
    if (storePlan === 1) {
      console.log(`[Plan1] Loja ${storeId} é Plano 1 (Vitrine) — forçando deliveryFee = 0`);
      effectiveDeliveryFee = 0;
    }

    // ✅ CÁLCULO DO PRODUTO (arredondado a centavos)
    const productStoreAmount = round2(productTotal * (1 - planCommissionDecimal));
    const productAppCommission = round2(productTotal * planCommissionDecimal);

    // ✅ CÁLCULO DA ENTREGA (zero para Plano 1)
    const deliveryMotoboyAmount = round2(effectiveDeliveryFee * (1 - motoboyCommissionDecimal));
    const deliveryAppCommission = round2(effectiveDeliveryFee * motoboyCommissionDecimal);

    // ✅ TOTAIS
    const storeAmount = productStoreAmount;
    const appAmount = round2(productAppCommission + deliveryAppCommission);
    const motoboyAmount = deliveryMotoboyAmount;
    const totalClient = round2(productTotal + effectiveDeliveryFee);

    return {
      // Total que cliente paga
      totalClient,

      // Distribuição por parte (produto)
      product: {
        total: productTotal,
        storeAmount: productStoreAmount,
        appCommission: productAppCommission,
        commissionPercent: planCommissionPercent,
      },

      // Distribuição por parte (entrega) — undefined para Plano 1
      delivery: storePlan === 1
        ? undefined
        : {
            total: effectiveDeliveryFee,
            motoboyAmount: deliveryMotoboyAmount,
            appCommission: deliveryAppCommission,
            commissionPercent: motoboyCommissionPercent,
          },

      // Totais consolidados
      storeAmount,
      appTotalCommission: appAmount,
      motoboyAmount: storePlan === 1 ? 0 : motoboyAmount,

      // Detalhado
      distribution: {
        store: storeAmount,
        app: appAmount,
        motoboy: storePlan === 1 ? 0 : motoboyAmount,
        client: totalClient,
      }
    };
  } catch (err) {
    // ⚠️ NUNCA usar um fallback fixo de 15% — isso cobraria a loja errado e de
    // forma silenciosa. Propagar o erro para o chamador abortar o pedido com segurança.
    console.error('❌ Erro ao calcular distribuição:', err);
    throw err instanceof Error ? err : new Error('Falha ao calcular distribuição do pedido');
  }
}

/**
 * Calcula a taxa de cancelamento tardio e sua distribuição
 * - totalFee: valor total da taxa (orderTotal * feePercent / 100)
 * - Se cancelledBy === 'motoboy': motoboy não recebe share (100% para o app)
 * - Caso contrário: motoboy recebe motoboySharePercent da taxa como compensação
 */
export function calculateLateCancellationFee(
  orderTotal: number,
  config: { lateCancellationFeePercent: number; lateCancellationMotoboyShare: number },
  cancelledBy: 'customer' | 'store' | 'motoboy'
): { totalFee: number; motoboyShare: number; appShare: number } {
  const totalFee = orderTotal * config.lateCancellationFeePercent / 100;

  if (cancelledBy === 'motoboy') {
    return { totalFee, motoboyShare: 0, appShare: totalFee };
  }

  const motoboyShare = totalFee * config.lateCancellationMotoboyShare / 100;
  const appShare = totalFee - motoboyShare;

  return { totalFee, motoboyShare, appShare };
}

/**
 * Retorna as permissões conforme o role
 */
export const rolePermissions: { [key: string]: string[] } = {
  ceo: ['*'], // Tudo

  marketing: [
    'notification:create',
    'banner:manage',
    'theme:edit'
  ],

  gerente_geral: [
    'notification:create',
    'notification:approve',
    'notification:reject',
    'user:view_all',
    'store:view_all',
    'wallet:view_all',
    'dashboard:view_all'
  ],

  gerente_clientes: [
    'notification:create',
    'user:view_clients',
    'user:edit_clients',
    'wallet:view_clients',
    'dashboard:view_client_metrics'
  ],

  gerente_lojistas: [
    'notification:create',
    'store:view_all',
    'store:edit',
    'wallet:view_stores',
    'dashboard:view_store_metrics'
  ],

  gerente_motoboys: [
    'notification:create',
    'user:view_motoboys',
    'user:edit_motoboys',
    'wallet:view_motoboys',
    'dashboard:view_motoboy_metrics'
  ],

  lojista: [
    'store:view_own',
    'store:edit_own',
    'product:create_own',
    'product:edit_own',
    'product:delete_own',
    'order:view_own',
    'wallet:view_own'
  ],

  cliente: [
    'order:create',
    'order:view_own',
    'order:cancel_own',
    'wallet:view_own',
    'wallet:credit',
    'address:manage_own'
  ],

  motoboy: [
    'delivery:view_own',
    'delivery:accept',
    'delivery:complete',
    'wallet:view_own',
    'wallet:transfer',
    'gamification:redeem_benefit'
  ]
};

/**
 * Verifica se um usuário tem uma permissão específica
 */
export function hasPermission(userRole: string, permission: string): boolean {
  const permissions = rolePermissions[userRole] || [];

  // Se role tem '*', tem tudo
  if (permissions.includes('*')) return true;

  // Senão verifica permissão específica
  return permissions.includes(permission);
}
