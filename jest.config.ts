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

  // ✅ Serializa as suítes: todas compartilham UM Postgres de dev com singletons
  // globais (PlatformConfig, AppCashbox) e não há banco isolado por worker. Em
  // paralelo, workers corriam sobre essas linhas únicas (ex.: uma suíte fazia PUT
  // em cancelFeeStorePercent enquanto outra lia o valor via getPlatformConfig),
  // causando falhas order-dependent. Rodar em série remove essas corridas.
  // A base efêmera por worker é a Fase 5 e permite voltar ao paralelo.
  maxWorkers: 1,

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
