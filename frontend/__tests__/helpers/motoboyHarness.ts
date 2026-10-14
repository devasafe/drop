/**
 * D2 · Etapa 0 — peças compartilhadas pelos contratos do motoboy: socket falso, GPS falso,
 * o "servidor" (estado que o mock de API do driver lê) e utilidades.
 * Nada aqui conhece tela: cada driver liga estas peças aos mocks do próprio arquivo.
 */
import { act } from '@testing-library/react';

export type ApiMock = { get: jest.Mock; post: jest.Mock; put: jest.Mock };

type Handler = (data: any) => void;

export interface SocketHarness {
  /** O valor que o `useSocket()` mockado devolve. As funções têm identidade estável. */
  api: {
    isConnected: boolean;
    isReconnecting: boolean;
    on: (event: string, h: Handler) => () => void;
    emit: jest.Mock;
    onReconnect: (cb: () => void) => () => void;
  };
  /** Entrega um evento do servidor a quem está ouvindo. */
  fire(event: string, data: any): void;
  /** Simula a volta do socket depois de uma queda (o `onReconnect` compartilhado da V16). */
  reconnect(): void;
  reset(): void;
}

export function createSocketHarness(): SocketHarness {
  const handlers = new Map<string, Set<Handler>>();
  const reconnects = new Set<() => void>();
  const api = {
    isConnected: true,
    isReconnecting: false,
    on: (event: string, h: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(h);
      return () => {
        handlers.get(event)?.delete(h);
      };
    },
    emit: jest.fn(),
    onReconnect: (cb: () => void) => {
      reconnects.add(cb);
      return () => {
        reconnects.delete(cb);
      };
    },
  };
  return {
    api,
    fire(event, data) {
      act(() => {
        Array.from(handlers.get(event) ?? []).forEach((h) => h(data));
      });
    },
    reconnect() {
      act(() => {
        Array.from(reconnects).forEach((cb) => cb());
      });
    },
    reset() {
      handlers.clear();
      reconnects.clear();
      api.emit.mockReset();
    },
  };
}

export interface GeoHarness {
  /** Entrega uma posição a todos os `watchPosition` ativos. */
  push(lat: number, lng: number, accuracy?: number): void;
  restore(): void;
}

/** Instala um `navigator.geolocation` falso. Chamar ANTES do render (o watch nasce no mount). */
export function installGeoMock(): GeoHarness {
  const watchers = new Map<number, PositionCallback>();
  let nextId = 1;
  const geo = {
    watchPosition: jest.fn((ok: PositionCallback) => {
      const id = nextId++;
      watchers.set(id, ok);
      return id;
    }),
    clearWatch: jest.fn((id: number) => {
      watchers.delete(id);
    }),
    getCurrentPosition: jest.fn(),
  };
  const nav = window.navigator as any;
  const original = Object.getOwnPropertyDescriptor(nav, 'geolocation');
  Object.defineProperty(nav, 'geolocation', { value: geo, configurable: true });
  return {
    push(lat, lng, accuracy = 8) {
      const pos = {
        coords: { latitude: lat, longitude: lng, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
        timestamp: Date.now(),
      } as unknown as GeolocationPosition;
      act(() => {
        Array.from(watchers.values()).forEach((cb) => cb(pos));
      });
    },
    restore() {
      if (original) Object.defineProperty(nav, 'geolocation', original);
      else delete nav.geolocation;
    },
  };
}

/** O que o servidor falso tem agora. O mock de `api.get` de cada driver lê daqui. */
export interface MotoboyServer {
  /** Pool de ofertas (`GET /deliveries/available`). */
  offers: any[];
  /** A corrida aberta (`GET /deliveries/:id`). */
  ride: any | null;
}

export function createServer(): MotoboyServer {
  return { offers: [], ride: null };
}

/** Chamadas de um mock de API cujo 1º argumento é exatamente `url`. */
export function callsTo(fn: jest.Mock, url: string): any[][] {
  return fn.mock.calls.filter((c) => c[0] === url);
}

export const flush = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/** Silencia o console e devolve tudo o que foi escrito nele (para provar que PIN não vai para log). */
export function spyConsole(): { text(): string; restore(): void } {
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation(() => {}),
  );
  const str = (a: any) => {
    if (typeof a === 'string') return a;
    try {
      return JSON.stringify(a);
    } catch {
      return String(a);
    }
  };
  return {
    text: () => spies.flatMap((s) => s.mock.calls.map((args) => args.map(str).join(' '))).join('\n'),
    restore: () => spies.forEach((s) => s.mockRestore()),
  };
}
