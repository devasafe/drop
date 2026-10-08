/**
 * Revisão final M1 — logger.error(msg, err, meta) não pode descartar o meta; o erro é serializado
 * só com campos seguros; o client do Asaas não loga errors[] cru (máscara de dígitos/e-mail/EVP).
 */
import { Writable } from 'stream';
import winston from 'winston';
import logger from '../config/logger';
import asaasClient, { AsaasApiError } from '../services/asaas/client';
import { maskSensitiveText, safeErrorText } from '../utils/safeErrorText';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) { lines.push(String(chunk)); cb(); },
  });
  const transport = new winston.transports.Stream({ stream });
  logger.add(transport);
  return { lines, done: () => logger.remove(transport) };
}

describe('M1 — logger', () => {
  it('logger.error(msg, err, meta) mantém o meta e serializa o erro (message/stack/status/errors mascarados)', () => {
    const c = capture();
    try {
      const err = new AsaasApiError(400, [{ code: 'invalid_pix', description: 'Chave 12345678909 de a@b.com inválida' }]);
      logger.error('[teste] falhou', err, { refundId: 'ref_m1', orderId: 'ord_m1' });
    } finally {
      c.done();
    }
    expect(c.lines.length).toBe(1);
    const out = JSON.parse(c.lines[0]);
    expect(out.refundId).toBe('ref_m1');
    expect(out.orderId).toBe('ord_m1');
    expect(out.error).toMatchObject({ name: 'AsaasApiError', status: 400 });
    expect(out.error.errors).toEqual([{ code: 'invalid_pix', description: expect.stringContaining('***') }]);
    expect(typeof out.error.stack).toBe('string');
    expect(c.lines[0]).not.toContain('12345678909');
    expect(c.lines[0]).not.toContain('a@b.com');
  });

  it('erro com config/headers (estilo axios) não vaza a chave', () => {
    const c = capture();
    try {
      const err: any = new Error('Request failed with status code 500');
      err.config = { headers: { access_token: '$aact_SEGREDO_M1' } };
      err.response = { status: 500, data: { x: 1 } };
      logger.error('[teste] axios', err, { storeId: 'st_m1' });
    } finally {
      c.done();
    }
    const out = JSON.parse(c.lines[0]);
    expect(out.storeId).toBe('st_m1');
    expect(out.error.message).toContain('status code 500');
    expect(out.error.status).toBe(500);
    expect(c.lines[0]).not.toContain('SEGREDO');
  });

  it('logger.error(msg, meta) e logger.warn(msg, meta) seguem iguais', () => {
    const c = capture();
    try {
      logger.error('[teste] so meta', { a: 1 });
    } finally {
      c.done();
    }
    expect(JSON.parse(c.lines[0])).toMatchObject({ message: '[teste] so meta', a: 1 });
  });
});

describe('M1 — máscara', () => {
  it('maskSensitiveText esconde dígitos, e-mail e EVP', () => {
    const t = maskSensitiveText('CPF 123.456.789-09, a@b.com, 123e4567-e89b-12d3-a456-426614174000');
    expect(t).not.toMatch(/\d/);
    expect(t).not.toContain('a@b.com');
    expect(t).not.toContain('e89b');
  });

  it('safeErrorText: code + descrição mascarada; erro nosso passa como está', () => {
    expect(safeErrorText(new AsaasApiError(400, [{ code: 'x', description: 'chave 11999998888' }]))).toBe('x: chave ***********');
    expect(safeErrorText(new Error('Conta da loja não conectada'))).toBe('Conta da loja não conectada');
  });

  it('client do Asaas loga errors[] com a descrição mascarada', async () => {
    const spy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const realFetch = global.fetch;
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: false, status: 400,
      text: async () => JSON.stringify({ errors: [{ code: 'invalid_pix', description: 'Chave 12345678909 / a@b.com' }] }),
    });
    try {
      await expect(asaasClient.postAs('$aact_x', '/transfers', {})).rejects.toBeInstanceOf(AsaasApiError);
    } finally {
      (global as any).fetch = realFetch;
    }
    const call = spy.mock.calls.find((c: any[]) => c[0] === 'Chamada Asaas falhou');
    expect(call).toBeTruthy();
    const dump = JSON.stringify(call);
    expect(dump).toContain('invalid_pix');
    expect(dump).not.toContain('12345678909');
    expect(dump).not.toContain('a@b.com');
    spy.mockRestore();
  });
});
