/**
 * Regras compartilhadas de saque.
 *
 * D3b-3: STALE_IN_FLIGHT_MS movida de src/controllers/withdrawalController.ts sem mudar o
 * valor, para a Visão geral do Dinheiro (moneyOverview.service) não importar um controller.
 */

/** Saque em `approved` sem a marca de incerteza só é resolvível depois disso (processo caiu). */
export const STALE_IN_FLIGHT_MS = 10 * 60 * 1000;
