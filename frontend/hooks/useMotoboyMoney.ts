import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { useSaasConfig } from './useSaasConfig';
import { useCustodyLeftoverState } from './useCustodyLeftoverState';
import { useSocket } from '../contexts/SocketContext';
import {
  indexMoney, moneyFor, payoutToMoney, transferToMoney, windowCovered,
  type MoneyIndex, type MoneyInfo,
} from '../lib/motoboyMoney';

export interface MotoboyMoney {
  status: 'loading' | 'ready' | 'error';
  /** Índice de tudo o que foi lido. Para uma corrida, prefira `moneyOf`, que respeita a cobertura. */
  index: MoneyIndex;
  /**
   * Fronteira do que foi lido (ISO): todo registro criado depois dela está no índice. null = as
   * listas vieram inteiras. Fica diferente de null sempre que a leitura parou com páginas sobrando:
   * ao cobrir a janela (`since`) ou ao bater o teto de páginas.
   */
  coveredFrom: string | null;
  /**
   * Dinheiro da corrida, ou null quando não há dado OU, com `coveredFrom` não nulo, quando o
   * createdAt da corrida não é posterior a `coveredFrom` (ou falta).
   */
  moneyOf: (d: any) => MoneyInfo | null;
  reload: () => void;
}

const LIMIT = 200;
/** Teto de páginas por lista em cada leitura (a lista nunca vira laço de GET). */
export const MONEY_MAX_PAGES = 10;
const EMPTY = indexMoney([]);
const HOUR_MS = 60 * 60 * 1000;

const time = (iso: string | null | undefined): number => (iso ? new Date(iso).getTime() : NaN);

interface Listed { items: MoneyInfo[]; boundary: string | null }

/**
 * Lê uma lista paginada (mais recente primeiro) até cobrir a janela, acabar ou bater o teto.
 * `boundary` = createdAt do último item lido quando ainda havia mais (null = lista inteira).
 */
async function readPages(
  fetchPage: (n: number, cursor: string | null) => Promise<{ raw: any[]; hasMore: boolean; cursor: string | null }>,
  toMoney: (x: any) => MoneyInfo | null,
  inWindow: (iso: string) => boolean,
  alive: () => boolean,
): Promise<Listed | null> {
  const seen = new Map<string, MoneyInfo>();
  const dates: Array<string | null> = [];
  let cursor: string | null = null;
  let hasMore = true;
  for (let n = 1; n <= MONEY_MAX_PAGES; n += 1) {
    const page = await fetchPage(n, cursor);
    if (!alive()) return null;
    for (const raw of page.raw) {
      const m = toMoney(raw);
      dates.push(m ? m.createdAt : (raw?.createdAt ?? null));
      if (m && !seen.has(m.id)) seen.set(m.id, m); // paginação por offset pode repetir item
    }
    hasMore = page.hasMore && page.raw.length > 0;
    cursor = page.cursor;
    if (windowCovered(dates, hasMore, inWindow)) break;
  }
  const last = dates[dates.length - 1] ?? null;
  // sem data no último item com mais páginas: fronteira desconhecida → nada fica coberto
  const boundary = hasMore ? (last && !Number.isNaN(time(last)) ? last : new Date(8.64e15).toISOString()) : null;
  return { items: [...seen.values()], boundary };
}

/**
 * Dinheiro de cada corrida do motoboy pelo modo da plataforma: custódia lê os repasses
 * (GET /payouts/my); direto lê os Pix das lojas (GET /motoboy/transfers) e, com saldo antigo,
 * também os repasses. Modo com erro → 'error' (nunca presume custódia).
 *
 * As listas são paginadas: lê páginas até cobrir a janela que a tela mostra, no máximo
 * MONEY_MAX_PAGES por lista. `since` = o MENOR createdAt das corridas exibidas (sem `since`, a lista
 * inteira). A chave é o createdAt da própria Delivery porque o dinheiro de uma corrida nunca nasce
 * antes da linha da entrega (mesmo relógio do Postgres); a hora final (deliveredAt/cancelledAt)
 * não serve: no cliente ausente a compensação nasce na marcação e o cancelledAt só na devolução.
 * Um repasse dividido por saque tem o pedaço novo na 1ª página e o original talvez numa página
 * depois: até a janela estar coberta o status fica 'loading' e o índice vazio (nunca total
 * parcial). Batendo o teto sem cobrir, `moneyOf` devolve null para as corridas fora da cobertura.
 * Releitura por reconexão só via useSocket().onReconnect.
 */
export function useMotoboyMoney(opts?: { since?: string | null }): MotoboyMoney {
  // `since` arredondado para baixo na hora: a janela só cresce (seguro) e um `since` recalculado
  // a cada render (ex.: a partir de Date.now()) não reinicia a leitura (sem laço de GET).
  const sinceT0 = time(opts?.since ?? null);
  const sinceKey = Number.isNaN(sinceT0) ? null : Math.floor(sinceT0 / HOUR_MS) * HOUR_MS;
  const saas = useSaasConfig();
  const leftover = useCustodyLeftoverState();
  const { onReconnect } = useSocket();
  const direto = saas.settlementMode === 'direto';
  const waiting = saas.loading || (direto && leftover.loading);
  const [status, setStatus] = useState<MotoboyMoney['status']>('loading');
  const [index, setIndex] = useState<MoneyIndex>(EMPTY);
  const [coveredFrom, setCoveredFrom] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const gen = useRef(0);
  const errRef = useRef(saas.error);
  errRef.current = saas.error;
  const retryRef = useRef(saas.retry);
  retryRef.current = saas.retry;

  useEffect(() => {
    const my = ++gen.current;
    // `stopped`: uma lista falhou → a outra para de pedir páginas
    let stopped = false;
    const alive = () => my === gen.current && !stopped;
    const stopOnFail = <T,>(pr: Promise<T>): Promise<T> => pr.catch((e) => { stopped = true; throw e; });
    const fail = () => { setIndex(EMPTY); setCoveredFrom(null); };
    if (saas.error) { fail(); setStatus('error'); return; }
    fail();
    setStatus('loading');
    if (waiting) return;
    const inWindow = sinceKey === null ? () => true : (iso: string) => !(time(iso) < sinceKey);
    const wantPayouts = !direto || leftover.hasLeftover;
    const none: Promise<Listed | null> = Promise.resolve({ items: [], boundary: null });
    Promise.all([
      wantPayouts
        ? stopOnFail(readPages(async (n) => {
          const r: any = await api.get('/payouts/my', { params: n === 1 ? { limit: LIMIT } : { limit: LIMIT, page: n } });
          const raw: any[] = Array.isArray(r?.data?.payouts) ? r.data.payouts : [];
          const total = Number(r?.data?.total);
          return { raw, hasMore: Number.isFinite(total) && n * LIMIT < total, cursor: null };
        }, payoutToMoney, inWindow, alive))
        : none,
      direto
        ? stopOnFail(readPages(async (_n, cursor) => {
          const r: any = await api.get('/motoboy/transfers', { params: cursor ? { limit: LIMIT, cursor } : { limit: LIMIT } });
          const raw: any[] = Array.isArray(r?.data?.data) ? r.data.data : [];
          const next = typeof r?.data?.nextCursor === 'string' && r.data.nextCursor ? r.data.nextCursor : null;
          return { raw, hasMore: next !== null, cursor: next };
        }, transferToMoney, inWindow, alive))
        : none,
    ])
      .then(([p, t]) => {
        if (!alive() || !p || !t) return;
        // fronteira comum: a mais recente das duas (o que vem depois dela está nas duas listas)
        const bounds = [p.boundary, t.boundary].filter((b): b is string => b !== null);
        const boundary = bounds.length ? bounds.reduce((a, b) => (time(b) > time(a) ? b : a)) : null;
        setIndex(indexMoney([...p.items, ...t.items]));
        setCoveredFrom(boundary);
        setStatus('ready');
      })
      .catch(() => {
        if (my !== gen.current) return;
        fail();
        setStatus('error');
      });
  }, [saas.error, waiting, direto, leftover.hasLeftover, sinceKey, attempt]);

  useEffect(() => () => { gen.current += 1; }, []);

  const reload = useCallback(() => {
    if (errRef.current) { retryRef.current?.(); return; }
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => onReconnect(reload), [onReconnect, reload]);

  const moneyOf = useCallback((d: any): MoneyInfo | null => {
    if (status !== 'ready') return null;
    if (coveredFrom !== null) {
      const t = time(d?.createdAt ? String(d.createdAt) : null);
      if (Number.isNaN(t) || !(t > time(coveredFrom))) return null;
    }
    return moneyFor(index, d);
  }, [status, index, coveredFrom]);

  return { status, index, coveredFrom, moneyOf, reload };
}
