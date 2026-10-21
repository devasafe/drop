/**
 * Decisões com 10 s para desfazer (D3b-2b, spec 8):
 * - a decisão de um item fica em espera, e a última da mesma chave vence;
 * - aos 10 s vai pelo `api` (o resultado volta à tela por onSettled);
 * - sair da página (troca de rota, aba fechada ou tela desmontada) manda na hora por fetch keepalive, com a mesma
 *   base e a mesma autenticação do `api`. A auth é o cookie httpOnly (credentials 'include'); o header
 *   Authorization só vai se o `api` tiver um.
 * A decisão sai da espera antes de qualquer envio: nunca vai duas vezes pelo cliente.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import api from './api';

export const DEFER_MS = 10_000;

/** O que enviar: POST na URL relativa do `api`, com corpo JSON opcional (aprovar vai sem corpo). */
export interface DeferredRequest { url: string; body?: unknown }
export interface DeferredResult { key: string; label: string; ok: boolean; error?: unknown }
export interface DeferredDecisions {
  /** chave → rótulo ("Aprovado", "Recusado") das decisões em espera. */
  pending: Record<string, string>;
  schedule: (key: string, run: DeferredRequest, label: string) => void;
  /** true se havia decisão em espera (e ela foi cancelada); false se já foi enviada ou não existe. */
  undo: (key: string) => boolean;
  /** Manda na hora, por keepalive, tudo o que espera. */
  flushAll: () => void;
}

interface Entry { run: DeferredRequest; label: string; timer: ReturnType<typeof setTimeout> }
interface ApiDefaults { defaults?: { baseURL?: unknown; headers?: { common?: Record<string, unknown> } } }

/** POST que sobrevive à saída da página (fetch keepalive), com a base e a autenticação do `api`. */
export function sendKeepalive(run: DeferredRequest): void {
  if (typeof fetch !== 'function') return;
  const defaults = (api as unknown as ApiDefaults).defaults;
  const base = typeof defaults?.baseURL === 'string' ? defaults.baseURL : '';
  const auth = defaults?.headers?.common?.Authorization;
  const headers: Record<string, string> = {};
  if (run.body !== undefined) headers['Content-Type'] = 'application/json';
  if (typeof auth === 'string' && auth) headers.Authorization = auth;
  try {
    void fetch(`${base}${run.url}`, {
      method: 'POST',
      keepalive: true,
      credentials: 'include',
      headers,
      body: run.body === undefined ? undefined : JSON.stringify(run.body),
    }).catch(() => undefined);
  } catch {
    // A página está saindo: não há onde avisar.
  }
}

export function useDeferredDecisions(onSettled?: (r: DeferredResult) => void): DeferredDecisions {
  const router = useRouter();
  const events = router?.events;
  const entries = useRef(new Map<string, Entry>());
  /** Enviadas pelo relógio e ainda sem resposta: a aba pode fechar no meio. */
  const inflight = useRef(new Set<DeferredRequest>());
  const [pending, setPending] = useState<Record<string, string>>({});
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  const alive = useRef(true);

  const sync = useCallback(() => {
    if (!alive.current) return;
    setPending(Object.fromEntries(Array.from(entries.current, ([k, e]) => [k, e.label])));
  }, []);

  const send = useCallback(async (key: string) => {
    const e = entries.current.get(key);
    if (!e) return;
    // Sai da espera antes do POST: a saída da página não manda de novo.
    entries.current.delete(key);
    inflight.current.add(e.run);
    sync();
    try {
      if (e.run.body === undefined) await api.post(e.run.url);
      else await api.post(e.run.url, e.run.body);
      if (alive.current) settledRef.current?.({ key, label: e.label, ok: true });
    } catch (error) {
      if (alive.current) settledRef.current?.({ key, label: e.label, ok: false, error });
    } finally {
      inflight.current.delete(e.run);
    }
  }, [sync]);

  const schedule = useCallback((key: string, run: DeferredRequest, label: string) => {
    const prev = entries.current.get(key);
    if (prev) clearTimeout(prev.timer);
    const timer = setTimeout(() => { void send(key); }, DEFER_MS);
    entries.current.set(key, { run, label, timer });
    sync();
  }, [send, sync]);

  const undo = useCallback((key: string): boolean => {
    const e = entries.current.get(key);
    if (!e) return false;
    clearTimeout(e.timer);
    entries.current.delete(key);
    sync();
    return true;
  }, [sync]);

  const flushAll = useCallback(() => {
    const list = Array.from(entries.current.values());
    if (list.length === 0) return;
    entries.current.clear();
    for (const e of list) {
      clearTimeout(e.timer);
      sendKeepalive(e.run);
    }
    sync();
  }, [sync]);

  useEffect(() => {
    alive.current = true;
    const onUnload = () => {
      flushAll();
      // Pedido em voo: o navegador pode cortá-lo ao fechar a aba. Vai de novo por keepalive; se o primeiro chegou,
      // o servidor responde 409 VERIFICATION_NOT_PENDING e nada se aplica duas vezes.
      inflight.current.forEach((run) => sendKeepalive(run));
      inflight.current.clear();
    };
    window.addEventListener('beforeunload', onUnload);
    events?.on('routeChangeStart', flushAll);
    return () => {
      alive.current = false;
      window.removeEventListener('beforeunload', onUnload);
      events?.off('routeChangeStart', flushAll);
      flushAll();
    };
  }, [events, flushAll]);

  return { pending, schedule, undo, flushAll };
}
