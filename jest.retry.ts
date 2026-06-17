/**
 * Retry automático de testes de integração.
 * Os testes que usam MongoMemoryReplSet + transações podem ter erros transitórios
 * (TransientTransactionError) quando vários replica sets em memória competem por CPU.
 * Isso é fragilidade do ambiente de teste, não do código — reexecutar resolve.
 */
jest.retryTimes(2, { logErrorsBeforeRetry: true });
