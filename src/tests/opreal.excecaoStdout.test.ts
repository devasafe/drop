/**
 * Operação real · exceção que derruba o processo também sai no stdout (os Runtime Logs do Coolify);
 * antes ia só para logs/exceptions.log, que some a cada deploy. A mensagem e a pilha saem mascaradas.
 */
import winston from 'winston';
import { exceptionStdoutTransport } from '../config/logger';

describe('transporte de exceções no stdout', () => {
  it('é um Console e mascara api_key na mensagem e na pilha', () => {
    const t = exceptionStdoutTransport();
    expect(t).toBeInstanceOf(winston.transports.Console);
    const info: any = t.format!.transform({
      level: 'error',
      message: 'uncaughtException: falhou com api_key=SEGREDO123',
      stack: 'Error: api_key=SEGREDO123\n    at x (y.ts:1:1)',
    } as any, {});
    expect(info.message).not.toContain('SEGREDO123');
    expect(info.stack).not.toContain('SEGREDO123');
    expect(info.stack).toContain('y.ts:1:1');
  });
});
