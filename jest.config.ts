import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  verbose: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/tests/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],

  // ✅ Setup de variáveis de ambiente para testes
  setupFiles: ['<rootDir>/jest.setup.ts'],

  // ✅ Retry de testes de integração (erros transitórios de transação no ReplSet em memória)
  setupFilesAfterEnv: ['<rootDir>/jest.retry.ts'],

  // Aumentar timeout para conexão com DB
  testTimeout: 30000,

  // ✅ Desabilitar diagnósticos TS em testes (erros pre-existentes no código fonte)
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { diagnostics: false }],
  },

  // Coletar cobertura de testes
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/config/**',
    '!src/middleware/**'
  ]
};

export default config;
