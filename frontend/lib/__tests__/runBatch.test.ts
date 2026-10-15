import { runBatch, retryFailed, batchSummaryText, type BatchResult } from '../runBatch';
import { isConflictWithCode } from '../adminErrors';

const isAlreadyDoneConflict = (e: unknown) => isConflictWithCode(e, 'ALREADY_DONE');

const http = (status: number, error?: string, code?: string) => ({ response: { status, data: { ...(error ? { error } : {}), ...(code ? { code } : {}) } } });

describe('runBatch (spec 6.2)', () => {
  it('sucesso: todos feitos, um por vez e na ordem', async () => {
    const calls: string[] = [];
    let running = 0;
    let max = 0;
    const send = async (k: string) => {
      calls.push(k);
      running += 1;
      max = Math.max(max, running);
      await Promise.resolve();
      await Promise.resolve();
      running -= 1;
    };
    const r = await runBatch(['a', 'b', 'c'], send);
    expect(calls).toEqual(['a', 'b', 'c']);
    expect(max).toBe(1);
    expect(r.done).toEqual(['a', 'b', 'c']);
    expect(r.failed).toEqual([]);
    expect(r.states).toEqual({ a: 'done', b: 'done', c: 'done' });
    expect(r.aborted).toBe(false);
  });

  it('falha parcial: o item que falha não para os outros e guarda a mensagem do servidor', async () => {
    const send = jest.fn(async (k: string) => { if (k === 'b') throw http(400, 'Saldo insuficiente'); });
    const r = await runBatch(['a', 'b', 'c'], send);
    expect(send.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c']);
    expect(r.done).toEqual(['a', 'c']);
    expect(r.failed).toEqual(['b']);
    expect(r.errors.b).toBe('Saldo insuficiente');
    expect(r.states.b).toBe('failed');
  });

  it('409 "já feito" conta como feito, não como erro, e nunca é reenviado', async () => {
    const send = jest.fn(async (k: string) => { if (k === 'b') throw http(409, 'Repasse já liberado', 'ALREADY_DONE'); });
    const r = await runBatch(['a', 'b'], send, { isAlreadyDone: isAlreadyDoneConflict });
    expect(r.done).toEqual(['a', 'b']);
    expect(r.failed).toEqual([]);
    expect(r.errors.b).toBeUndefined();
    const again = await retryFailed(r, send, { isAlreadyDone: isAlreadyDoneConflict });
    expect(send).toHaveBeenCalledTimes(2);
    expect(again.done).toEqual(['a', 'b']);
  });

  it('409 com outro código não é "já feito"', async () => {
    const r = await runBatch(['a'], async () => { throw http(409, 'Saque não pode ser resolvido', 'WITHDRAWAL_NOT_RESOLVABLE'); }, { isAlreadyDone: isAlreadyDoneConflict });
    expect(r.failed).toEqual(['a']);
  });

  it('onProgress que lança não interrompe o lote nem perde o resultado', async () => {
    const send = jest.fn(async () => undefined);
    let n = 0;
    const r = await runBatch(['a', 'b'], send, { onProgress: () => { n += 1; if (n === 2) throw new Error('boom'); } });
    expect(send).toHaveBeenCalledTimes(2);
    expect(r.done).toEqual(['a', 'b']);
  });

  it('isAlreadyDone que lança: o item vira falho, o lote segue e retryFailed não reenvia os feitos', async () => {
    const send = jest.fn(async (k: string) => { if (k === 'a') throw http(409, 'x'); });
    const r = await runBatch(['a', 'b'], send, { isAlreadyDone: () => { throw new Error('boom'); } });
    expect(r.failed).toEqual(['a']);
    expect(r.done).toEqual(['b']);
    send.mockClear();
    await retryFailed(r, async (k) => { await send(k); });
    expect(send.mock.calls.map((c) => c[0])).toEqual(['a']);
  });

  it('retryFailed com onProgress que lança: resolve com o resultado mesclado', async () => {
    const first: BatchResult = { states: { a: 'done', b: 'failed', c: 'failed' }, errors: { b: 'e', c: 'e' }, done: ['a'], failed: ['b', 'c'], aborted: false };
    const send = jest.fn(async () => undefined);
    const r = await retryFailed(first, send, { onProgress: () => { throw new Error('boom'); } });
    expect(send).toHaveBeenCalledTimes(2);
    expect(r.done).toEqual(['a', 'b', 'c']);
    expect(r.failed).toEqual([]);
  });

  it('sem isAlreadyDone, um 409 é erro (nada vira feito por acaso)', async () => {
    const r = await runBatch(['a'], async () => { throw http(409, 'Saque não pode ser resolvido'); });
    expect(r.failed).toEqual(['a']);
    expect(r.errors.a).toBe('Saque não pode ser resolvido');
  });

  it('"Tentar de novo os que falharam": só reenvia os que falharam; o que foi feito fica feito', async () => {
    const fail = new Set(['b', 'c']);
    const send = jest.fn(async (k: string) => { if (fail.has(k)) throw http(500, 'Erro'); });
    const first = await runBatch(['a', 'b', 'c'], send);
    expect(first.failed).toEqual(['b', 'c']);
    fail.clear();
    send.mockClear();
    const second = await retryFailed(first, send);
    expect(send.mock.calls.map((c) => c[0])).toEqual(['b', 'c']);
    expect(second.done).toEqual(['a', 'b', 'c']);
    expect(second.failed).toEqual([]);
    expect(second.errors).toEqual({});
  });

  it('retryFailed: quem falha de novo continua falho com a mensagem nova', async () => {
    const first: BatchResult = { states: { a: 'done', b: 'failed' }, errors: { b: 'velha' }, done: ['a'], failed: ['b'], aborted: false };
    const r = await retryFailed(first, async () => { throw http(400, 'nova'); });
    expect(r.failed).toEqual(['b']);
    expect(r.errors.b).toBe('nova');
    expect(r.done).toEqual(['a']);
  });

  it('abortar (fechar a tela) para o lote: o que foi feito fica feito, o resto fica na fila', async () => {
    const ctrl = new AbortController();
    const send = jest.fn(async (k: string) => { if (k === 'a') ctrl.abort(); });
    const r = await runBatch(['a', 'b', 'c'], send, { signal: ctrl.signal });
    expect(send).toHaveBeenCalledTimes(1);
    expect(r.done).toEqual(['a']);
    expect(r.states.b).toBe('queued');
    expect(r.states.c).toBe('queued');
    expect(r.aborted).toBe(true);
  });

  it('signal já abortado: nada é enviado', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const send = jest.fn(async () => undefined);
    const r = await runBatch(['a'], send, { signal: ctrl.signal });
    expect(send).not.toHaveBeenCalled();
    expect(r.aborted).toBe(true);
  });

  it('chave repetida é enviada uma vez só', async () => {
    const send = jest.fn(async () => undefined);
    const r = await runBatch(['a', 'a', 'b'], send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(r.done).toEqual(['a', 'b']);
  });

  it('onProgress mostra cada item enviando e depois feito', async () => {
    const seen: string[] = [];
    await runBatch(['a', 'b'], async () => undefined, { onProgress: (r) => seen.push(`${r.states.a}/${r.states.b}`) });
    expect(seen).toEqual(['sending/queued', 'done/queued', 'done/sending', 'done/done']);
  });

  it('403 no meio do lote: "Você não tem permissão para isso" naquele item', async () => {
    const r = await runBatch(['a'], async () => { throw http(403, 'Permissão negada'); });
    expect(r.errors.a).toBe('Você não tem permissão para isso');
  });
});

describe('batchSummaryText', () => {
  const res = (done: number, failed: number, aborted = false): BatchResult => ({
    states: {}, errors: {}, aborted,
    done: Array.from({ length: done }, (_, i) => `d${i}`),
    failed: Array.from({ length: failed }, (_, i) => `f${i}`),
  });
  it('"10 liberados, 2 com erro"', () => {
    expect(batchSummaryText(res(10, 2), { one: 'liberado', many: 'liberados' })).toBe('10 liberados, 2 com erro');
    expect(batchSummaryText(res(1, 0), { one: 'liberado', many: 'liberados' })).toBe('1 liberado');
    expect(batchSummaryText(res(3, 0, true), { one: 'aprovado', many: 'aprovados' })).toBe('3 aprovados (parou antes do fim)');
  });
});
