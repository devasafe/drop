import winston from 'winston';
import path from 'path';
import { maskAsaasErrors, maskCredentials, maskSensitiveText } from '../utils/safeErrorText';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const SPLAT = Symbol.for('splat');

/**
 * Serializa um erro só com campos seguros: name, message, stack, status/statusCode, code e
 * errors[] do Asaas (descrição mascarada). Nunca copia `config`/`headers`/`request`/`response`
 * inteiros (o erro estilo axios carrega o header `access_token` com a chave da loja).
 */
export function serializeError(err: any): Record<string, unknown> {
  const isAsaas = Array.isArray(err?.errors);
  const out: Record<string, unknown> = {
    name: err?.name,
    message: isAsaas ? maskSensitiveText(err?.message) : maskCredentials(err?.message),
  };
  if (err?.stack) {
    const stack = isAsaas && err.message ? String(err.stack).split(String(err.message)).join(String(out.message)) : String(err.stack);
    out.stack = maskCredentials(stack);
  }
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  if (typeof status === 'number') out.status = status;
  if (typeof err?.code === 'string' || typeof err?.code === 'number') out.code = err.code;
  if (isAsaas) out.errors = maskAsaasErrors(err.errors);
  return out;
}

/**
 * `logger.error(msg, err, meta)`: o winston só usa o 1º argumento extra (e copia as
 * propriedades enumeráveis do erro para o log). Aqui o erro vira `error` serializado com
 * campos seguros e os objetos seguintes (meta) são mesclados.
 */
const mergeErrorAndMeta = winston.format((info: any) => {
  const splat = info[SPLAT];
  if (!Array.isArray(splat) || splat.length === 0) return info;
  const [first, ...rest] = splat;
  if (first instanceof Error) {
    for (const k of Object.keys(first)) delete info[k];
    delete info.stack;
    const e = serializeError(first);
    // o winston anexa err.message à mensagem; troca pela versão segura
    const raw = String((first as Error).message ?? '');
    if (raw && typeof info.message === 'string' && info.message.endsWith(` ${raw}`)) {
      info.message = `${info.message.slice(0, -raw.length - 1)} ${e.message}`;
    }
    info.error = e;
  }
  for (const m of rest) {
    if (m instanceof Error) info.cause = serializeError(m);
    else if (m && typeof m === 'object') Object.assign(info, m);
  }
  return info;
});

// Formato customizado para logs
const customFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
  return `${timestamp} [${level}] ${message} ${metaStr}`;
});

// Cores para diferentes níveis
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
};

// Configurar cores
winston.addColors(colors);

// Transportes para produção
const productionTransports = [
  // stdout em JSON: é o que aparece nos Runtime Logs do Coolify (os arquivos ficam presos no
  // container e somem a cada deploy).
  new winston.transports.Console({ format: json() }),
  // Log de erros em arquivo separado
  new winston.transports.File({
    filename: path.join('logs', 'error.log'),
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
  // Todos os logs em arquivo combinado
  new winston.transports.File({
    filename: path.join('logs', 'combined.log'),
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
];

// Transportes para desenvolvimento
const developmentTransports = [
  new winston.transports.Console({
    format: combine(colorize(), customFormat),
  }),
  new winston.transports.File({
    filename: path.join('logs', 'debug.log'),
    level: 'debug',
  }),
];

/**
 * Exceção que derruba o processo também vai para o stdout (Runtime Logs do Coolify): o arquivo
 * logs/exceptions.log fica preso no container e some a cada deploy. Mensagem e pilha mascaradas.
 */
export function exceptionStdoutTransport(): winston.transport {
  const mask = winston.format((info: any) => {
    if (info.message !== undefined) info.message = maskCredentials(info.message);
    if (info.stack !== undefined) info.stack = maskCredentials(info.stack);
    return info;
  });
  return new winston.transports.Console({ format: combine(mask(), json()) });
}

// Criar logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: combine(
    mergeErrorAndMeta(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    json(),
  ),
  transports:
    process.env.NODE_ENV === 'production' ? productionTransports : developmentTransports,
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join('logs', 'exceptions.log') }),
    exceptionStdoutTransport(),
  ],
  // Sem rejectionHandlers: o do winston (com exitOnError) encerrava o processo a cada promessa
  // rejeitada sem tratamento — ex.: a promessa interna do SDK do Cloudinary num 401 (V15) — e
  // gravava a mensagem crua (com a api_key). Ver logUnhandledRejection abaixo.
});

// Adicionar transportes de console em desenvolvimento
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: combine(colorize(), customFormat),
    }),
  );
}

/**
 * Rejeição de promessa sem tratamento: loga (mensagem sem credenciais) e mantém o processo no ar.
 * Uma rejeição solta é bug a corrigir, mas não pode derrubar a API inteira. Exceções síncronas
 * (uncaughtException) continuam encerrando o processo pelos exceptionHandlers acima.
 */
export function logUnhandledRejection(reason: unknown): void {
  const err =
    reason instanceof Error
      ? reason
      : Object.assign(new Error(String((reason as any)?.message ?? reason)), {
          name: (reason as any)?.name || 'Error',
          ...(typeof (reason as any)?.http_code === 'number' ? { status: (reason as any).http_code } : {}),
        });
  logger.error('unhandledRejection (processo mantido no ar)', err);
}

let rejectionHandlerInstalled = false;
/** Registra logUnhandledRejection no processo (uma vez). Chamado no boot (src/index.ts). */
export function installUnhandledRejectionHandler(): void {
  if (rejectionHandlerInstalled) return;
  rejectionHandlerInstalled = true;
  process.on('unhandledRejection', logUnhandledRejection);
}

/**
 * Métodos de logging estruturados
 */
export const log = {
  // Log de informações
  info: (message: string, meta?: Record<string, any>) => {
    logger.info(message, meta || {});
  },

  // Log de erros
  error: (message: string, error?: Error | string, meta?: Record<string, any>) => {
    if (typeof error === 'string') {
      logger.error(message, { error, ...meta });
    } else if (error instanceof Error) {
      logger.error(message, { error: error.message, stack: error.stack, ...meta });
    } else {
      logger.error(message, meta || {});
    }
  },

  // Log de avisos
  warn: (message: string, meta?: Record<string, any>) => {
    logger.warn(message, meta || {});
  },

  // Log de debug
  debug: (message: string, meta?: Record<string, any>) => {
    logger.debug(message, meta || {});
  },

  // Log de operação
  operation: (operation: string, details?: Record<string, any>) => {
    logger.info(`[${operation}] Iniciado`, { operation, ...details });
  },

  // Log de sucesso de operação
  operationSuccess: (operation: string, details?: Record<string, any>) => {
    logger.info(`[${operation}] ✅ Sucesso`, { operation, ...details });
  },

  // Log de erro de operação
  operationError: (operation: string, error: Error | string, details?: Record<string, any>) => {
    const errorMessage = typeof error === 'string' ? error : error.message;
    logger.error(`[${operation}] ❌ Erro`, {
      operation,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      ...details,
    });
  },

  // Log de requisição HTTP
  request: (method: string, path: string, statusCode: number, responseTime: number, meta?: Record<string, any>) => {
    const level = statusCode >= 400 ? 'warn' : 'info';
    logger[level as 'info' | 'warn'](`${method} ${path} ${statusCode}`, {
      method,
      path,
      statusCode,
      responseTime: `${responseTime}ms`,
      ...meta,
    });
  },

  // Log de autenticação
  auth: (action: string, userId?: string, meta?: Record<string, any>) => {
    logger.info(`[AUTH] ${action}`, { userId, ...meta });
  },

  // Log de transação/negócio
  transaction: (action: string, data?: Record<string, any>) => {
    logger.info(`[TRANSACTION] ${action}`, { ...data });
  },
};

export default logger;
