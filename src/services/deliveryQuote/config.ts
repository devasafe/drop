import { getPlatformConfig } from '../../repositories/platformConfig.repository';

export interface DeliveryConfig {
  defaultRadiusKm: number;
  defaultPrepMinutes: number;
  avgSpeedKmh: number;
  detourFactor: number;
  /** Parte fixa da taxa de entrega (`motoboyCutPerDelivery`). */
  base: number;
  /** Valor por km de rota (`motoboyCutPerKm`). */
  perKm: number;
}

/** Config de cotação/prazo de entrega lida do PlatformConfig, com os defaults do dono. */
export async function getDeliveryConfig(): Promise<DeliveryConfig> {
  const c = await getPlatformConfig();
  return {
    defaultRadiusKm: Number(c?.defaultDeliveryRadiusKm ?? 12),
    defaultPrepMinutes: Number(c?.defaultPrepMinutes ?? 15),
    avgSpeedKmh: Number(c?.courierAvgSpeedKmh ?? 25),
    detourFactor: Number(c?.routeDetourFactor ?? 1.3),
    base: Number(c?.motoboyCutPerDelivery || 5),
    perKm: Number(c?.motoboyCutPerKm || 1),
  };
}

/** Raio efetivo: a loja só pode diminuir o padrão da plataforma, nunca ampliar. */
export function effectiveRadiusKm(
  store: { deliveryRadiusKm?: number | null } | null | undefined,
  cfg: Pick<DeliveryConfig, 'defaultRadiusKm'>,
): number {
  return Math.min(store?.deliveryRadiusKm ?? cfg.defaultRadiusKm, cfg.defaultRadiusKm);
}

/** Tempo de preparo efetivo (min): o da loja, ou o padrão da plataforma. */
export function effectivePrepMinutes(
  store: { prepMinutes?: number | null } | null | undefined,
  cfg: Pick<DeliveryConfig, 'defaultPrepMinutes'>,
): number {
  return store?.prepMinutes ?? cfg.defaultPrepMinutes;
}
