/**
 * Logger condicional para o frontend.
 * Em produção, logs de debug são silenciados automaticamente.
 * Apenas erros sempre aparecem (para monitoramento).
 */

const isDev = process.env.NODE_ENV === 'development';

export const log = isDev ? console.log.bind(console) : () => {};
export const warn = isDev ? console.warn.bind(console) : () => {};
export const debug = isDev ? console.debug.bind(console) : () => {};

// Erros sempre são logados (para Sentry, DataDog, etc.)
export const error = console.error.bind(console);

const logger = { log, warn, debug, error };

export default logger;
