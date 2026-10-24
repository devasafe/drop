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

  it('não copia o erro inteiro nem process/os: só campos seguros, erro serializado', () => {
    const t = exceptionStdoutTransport();
    const err: any = Object.assign(new Error('falhou'), { config: { headers: { access_token: '$aact_prod_SEGREDO' } } });
    const info: any = t.format!.transform({
      level: 'error', message: 'uncaughtException: falhou', stack: err.stack, error: err, exception: true,
      date: 'hoje', process: { argv: ['node', 'x'], cwd: '/app' }, os: { loadavg: [1] }, trace: [{ file: 'y.ts' }],
    } as any, {});
    expect(Object.keys(info).filter((k) => typeof k === 'string').sort()).toEqual(['date', 'error', 'exception', 'level', 'message', 'stack']);
    expect(JSON.stringify(info.error)).not.toContain('SEGREDO');
    expect(info.error).toMatchObject({ name: 'Error', message: 'falhou' });
  });
});
