/**
 * Configuração central de timeouts e debouncing
 * Facilita ajuste de performance sem alterar código
 */

export const SOCKET_CONFIG = {
  // Connection
  CONNECTION_TIMEOUT: 5000, // 5 segundos
  RECONNECT_BASE_DELAY: 1000, // 1 segundo
  RECONNECT_MAX_DELAY: 30000, // 30 segundos
  RECONNECT_MAX_ATTEMPTS: 10, // máximo de tentativas

  // Debouncing
  DEBOUNCE: {
    LOCATION_UPDATE: 10000, // 10 segundos - para location updates de motoboys
    PRODUCT_UPDATE: 2000, // 2 segundos - para atualizações de produto
    ORDER_UPDATE: 1000, // 1 segundo - para atualizações de pedido
    SEARCH: 500, // 500ms - para buscas em tempo real
  },

  // Throttling
  THROTTLE: {
    LOCATION_BROADCAST: 5000, // broadcast location máximo 1x a cada 5s
    ANALYTICS_REPORT: 30000, // relatório de analytics máximo 1x a cada 30s
  },

  // Limits
  LIMITS: {
    MAX_CONNECTIONS_PER_USER: 3, // máximo de conexões simultâneas
    MAX_EVENTS_PER_SECOND: 100, // proteção contra DDoS
    MESSAGE_MAX_SIZE: 1024 * 100, // 100KB
  },

  // Logging
  DEBUG: process.env.NODE_ENV === 'development',
  LOG_SOCKET_EVENTS: process.env.LOG_SOCKET_EVENTS === 'true',
} as const;

/**
 * Export para uso em diferentes partes da app
 */
export const RECONNECT_DELAYS = {
  initial: SOCKET_CONFIG.RECONNECT_BASE_DELAY,
  max: SOCKET_CONFIG.RECONNECT_MAX_DELAY,
  exponentialBase: 2,
} as const;

export default SOCKET_CONFIG;
