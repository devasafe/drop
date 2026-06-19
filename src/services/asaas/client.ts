import env from '../../config/env';
import logger from '../../config/logger';

/**
 * Client HTTP do Asaas.
 *
 * Autenticação: header `access_token` (a chave começa com "$" — faz parte dela).
 * Base URL vem de ASAAS_API_URL (sandbox por padrão).
 *
 * Toda chamada que falhar (HTTP >= 400) lança AsaasApiError com os erros
 * estruturados que o Asaas devolve em `errors[]`.
 */

export interface AsaasError {
  code: string;
  description: string;
}

export class AsaasApiError extends Error {
  status: number;
  errors: AsaasError[];

  constructor(status: number, errors: AsaasError[]) {
    super(errors?.[0]?.description || `Erro na API do Asaas (HTTP ${status})`);
    this.name = 'AsaasApiError';
    this.status = status;
    this.errors = errors || [];
  }
}

export class AsaasNotConfiguredError extends Error {
  constructor() {
    super('ASAAS_API_KEY não configurada — defina no .env antes de usar o Asaas.');
    this.name = 'AsaasNotConfiguredError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

// apiKey opcional: quando informada, a chamada é feita COMO aquela subconta
// (necessário p/ saque da subconta). Sem ela, usa a conta-mãe (env.ASAAS_API_KEY).
async function request<T>(method: Method, path: string, body?: unknown, apiKey?: string): Promise<T> {
  const key = apiKey || env.ASAAS_API_KEY;
  if (!key) {
    throw new AsaasNotConfiguredError();
  }

  const url = `${env.ASAAS_API_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      access_token: key,
      'Content-Type': 'application/json',
      // O Asaas recomenda identificar a aplicação no User-Agent.
      'User-Agent': 'DROP-Marketplace',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const raw = await res.text();
  let data: any = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { _raw: raw };
    }
  }

  if (!res.ok) {
    const errors: AsaasError[] = Array.isArray(data?.errors)
      ? data.errors
      : [{ code: 'unknown', description: data?._raw || `HTTP ${res.status}` }];
    logger.warn('Chamada Asaas falhou', { method, path, status: res.status, errors });
    throw new AsaasApiError(res.status, errors);
  }

  return data as T;
}

export const asaasClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),

  // Chamadas autenticadas COMO uma subconta (usa a apiKey dela).
  postAs: <T>(apiKey: string, path: string, body?: unknown) => request<T>('POST', path, body, apiKey),
  getAs: <T>(apiKey: string, path: string) => request<T>('GET', path, undefined, apiKey),

  /** Saldo da conta-mãe — útil pra smoke test de conectividade. */
  getBalance: () => request<{ balance: number }>('GET', '/finance/balance'),

  /** True se a chave está configurada (não valida no servidor do Asaas). */
  isConfigured: () => !!env.ASAAS_API_KEY,
};

export default asaasClient;
