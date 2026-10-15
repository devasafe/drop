import { adminErrorMessage } from './adminErrors';

/**
 * Lote do admin sem rota de lote no servidor (spec D3a 6.2): um item por vez, em sequência.
 * - Um item que falha não para os outros; a mensagem do servidor fica em `errors`.
 * - `isAlreadyDone(err)` true → o item conta como feito (nunca é reenviado). Sem padrão: cada tela diz quando.
 * - `signal` abortado (tela fechada) para o lote; o que foi feito fica feito, o resto fica 'queued'.
 */
export type BatchItemState = 'queued' | 'sending' | 'done' | 'failed';

export interface BatchResult<K extends string = string> {
  states: Record<K, BatchItemState>;
  /** Só os itens que falharam. */
  errors: Record<K, string>;
  done: K[];
  failed: K[];
  /** true quando o lote parou antes do fim (sobrou item na fila). */
  aborted: boolean;
}

export interface BatchOptions<K extends string> {
  isAlreadyDone?: (err: unknown) => boolean;
  onProgress?: (r: BatchResult<K>) => void;
  signal?: AbortSignal;
}

/** Callbacks da tela nunca derrubam o lote: um que lança é ignorado. */
function safeProgress<K extends string>(fn: ((r: BatchResult<K>) => void) | undefined, r: BatchResult<K>): void {
  try { fn?.(r); } catch { /* ignorado de propósito */ }
}

function safeAlreadyDone(fn: ((err: unknown) => boolean) | undefined, err: unknown): boolean {
  try { return fn?.(err) === true; } catch { return false; }
}

export async function runBatch<K extends string>(
  keys: K[],
  send: (key: K) => Promise<void>,
  opts: BatchOptions<K> = {},
): Promise<BatchResult<K>> {
  const order = Array.from(new Set(keys));
  const states = {} as Record<K, BatchItemState>;
  const errors = {} as Record<K, string>;
  order.forEach((k) => { states[k] = 'queued'; });

  const snapshot = (): BatchResult<K> => ({
    states: { ...states },
    errors: { ...errors },
    done: order.filter((k) => states[k] === 'done'),
    failed: order.filter((k) => states[k] === 'failed'),
    aborted: order.some((k) => states[k] === 'queued'),
  });

  for (const k of order) {
    if (opts.signal?.aborted) break;
    states[k] = 'sending';
    safeProgress(opts.onProgress, snapshot());
    try {
      await send(k);
      states[k] = 'done';
    } catch (err) {
      if (safeAlreadyDone(opts.isAlreadyDone, err)) {
        states[k] = 'done';
      } else {
        states[k] = 'failed';
        errors[k] = adminErrorMessage(err);
      }
    }
    safeProgress(opts.onProgress, snapshot());
  }
  return snapshot();
}

function merge<K extends string>(prev: BatchResult<K>, next: BatchResult<K>): BatchResult<K> {
  const states = { ...prev.states, ...next.states } as Record<K, BatchItemState>;
  const errors = { ...prev.errors } as Record<K, string>;
  (Object.keys(next.states) as K[]).forEach((k) => {
    if (next.states[k] === 'failed') errors[k] = next.errors[k];
    else delete errors[k];
  });
  const order = Object.keys(states) as K[];
  return {
    states,
    errors,
    done: order.filter((k) => states[k] === 'done'),
    failed: order.filter((k) => states[k] === 'failed'),
    aborted: next.aborted,
  };
}

/** "Tentar de novo os que falharam": reenvia só `prev.failed`; o que foi feito continua feito. */
export async function retryFailed<K extends string>(
  prev: BatchResult<K>,
  send: (key: K) => Promise<void>,
  opts: BatchOptions<K> = {},
): Promise<BatchResult<K>> {
  const onProgress = opts.onProgress;
  const again = await runBatch(prev.failed, send, {
    ...opts,
    onProgress: onProgress ? (r) => safeProgress(onProgress, merge(prev, r)) : undefined,
  });
  return merge(prev, again);
}

/** "10 liberados, 2 com erro" (+ "(parou antes do fim)" quando o lote foi interrompido). */
export function batchSummaryText(r: BatchResult, words: { one: string; many: string }): string {
  const d = r.done.length;
  const f = r.failed.length;
  const head = `${d} ${d === 1 ? words.one : words.many}`;
  const tail = f > 0 ? `, ${f} com erro` : '';
  const stop = r.aborted ? ' (parou antes do fim)' : '';
  return `${head}${tail}${stop}`;
}
