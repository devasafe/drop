/**
 * Sandbox 2026-10-09: em produção o logger só escrevia em logs/*.log dentro do container —
 * nada aparecia nos Runtime Logs do Coolify e tudo se perdia a cada deploy. Em produção ele
 * também precisa escrever no console (stdout), em JSON.
 */
import winston from 'winston';

function loadLogger(nodeEnv: string): winston.Logger {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  let logger: winston.Logger | undefined;
  try {
    jest.isolateModules(() => {
      logger = require('../config/logger').default;
    });
  } finally {
    process.env.NODE_ENV = prev;
  }
  return logger!;
}

// isolateModules carrega outra instância do winston: compara pelo nome do transport, não por instanceof.
const consoleOf = (l: winston.Logger) => l.transports.find((t: any) => t.name === 'console');
const hasConsole = (l: winston.Logger) => !!consoleOf(l);

describe('t58 — logger em produção escreve no console', () => {
  it('NODE_ENV=production → tem transport de Console', () => {
    expect(hasConsole(loadLogger('production'))).toBe(true);
  });

  it('em produção o console sai em JSON (sem cor), com a mensagem e o meta', () => {
    const l = loadLogger('production');
    const consoleT = consoleOf(l)!;
    const info: any = { level: 'info', message: 'teste-json', storeId: 's1' };
    const out = (consoleT.format as any).transform({ ...info, [Symbol.for('level')]: 'info' }, (consoleT.format as any).options ?? {}) as any;
    const line = out[Symbol.for('message')];
    expect(() => JSON.parse(line)).not.toThrow();
    expect(JSON.parse(line)).toMatchObject({ message: 'teste-json', storeId: 's1' });
  });
});
