/**
 * ✅ SETUP DE TESTES: Configurar variáveis de ambiente
 * Este arquivo é executado antes de todos os testes
 */

// Configurar variáveis de ambiente para testes
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://localhost:27017/drop-test';
process.env.JWT_SECRET = 'test_secret_key_with_minimum_32_characters_length_ok';
process.env.JWT_EXPIRES_IN = '7d';
process.env.CORS_ORIGIN = 'http://localhost:3000,http://localhost:3001';
process.env.LOG_LEVEL = 'error'; // Evitar spam de logs em testes
process.env.ENABLE_SOCKET_IO = 'false';
process.env.DELIVERY_TIMEOUT_MINUTES = '30';
process.env.AUTH_LIMITER_MAX = '5';
process.env.AUTH_LIMITER_WINDOW_MS = '900000';

// Desabilitar logs em testes
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};
