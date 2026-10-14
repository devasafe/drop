/**
 * D2 · Etapa 0 — contratos do motoboy na aba Corridas e na corrida.
 * As expectativas são sobre CHAMADAS DE API, EVENTOS DE SOCKET e o que o motoboy vê, nunca
 * sobre estrutura ou texto de botão. Cada tela (a atual e, depois, a do DS v2) implementa um
 * driver e chama o `run…Contract` correspondente.
 *
 * Teste de comportamento da Etapa 0: as expectativas daqui são INTOCÁVEIS.
 */
import { act, waitFor } from '@testing-library/react';
import { ApiMock, SocketHarness, MotoboyServer, GeoHarness, callsTo, flush } from './motoboyHarness';

export const CONTRACT_MOTOBOY_ID = 'm-1';
/** Id fixo da corrida dos contratos (os drivers usam o mesmo literal no mock do router). */
export const RIDE_ID = 'd-ride';
export const CONTRACT_PICKUP_PIN = '54321';
export const CONTRACT_DELIVERY_PIN = '12345';
export const CONTRACT_RETURN_PIN = '654321';

export interface MotoboyCtx {
  api: ApiMock;
  socket: SocketHarness;
  server: MotoboyServer;
  geo: GeoHarness;
}

export function offer(id: string, extra: Record<string, unknown> = {}): any {
  return {
    _id: id,
    id,
    orderId: `order-${id}`,
    status: 'pending',
    fee: 10,
    distance: 2.5,
    storeAddress: 'Loja Contrato - Rua A, 10',
    customerAddress: 'Rua B, 20 - Centro',
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

export type RideStatus = 'assigned' | 'picked' | 'delivered' | 'cancelled';

/** A corrida como `GET /deliveries/:id` devolve para o motoboy dela (inclui os campos da Etapa 1). */
export function ride(status: RideStatus, extra: Record<string, unknown> = {}): any {
  const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  return {
    _id: RIDE_ID,
    id: RIDE_ID,
    orderId: 'order-ride-000123',
    motoboyId: CONTRACT_MOTOBOY_ID,
    status,
    fee: 10,
    distance: 3,
    pinRetirada: status === 'assigned' ? CONTRACT_PICKUP_PIN : null,
    pinDevolucao: null,
    storeAddress: 'Loja Contrato - Rua A, 10',
    customerAddress: 'Rua B, 20 - Centro',
    storeObj: { _id: 's-1', name: 'Loja Contrato', address: 'Rua A, 10', telefone: '21999990000' },
    customerObj: { _id: 'c-1', name: 'Ana Cliente', telefone: '21988880000' },
    order: {
      _id: 'order-ride-000123',
      status: status === 'assigned' ? 'aguardando_motoboy' : 'enviado',
      deliveryFee: 10,
      products: [{ productId: 'p1', productName: 'X-Burger', quantity: 1, price: 20 }],
    },
    assignedAt: ago(20),
    pickedAt: status === 'assigned' ? null : ago(5),
    deliveredAt: status === 'delivered' ? ago(1) : null,
    cancelledAt: status === 'cancelled' ? ago(1) : null,
    createdAt: ago(30),
    updatedAt: ago(1),
    customerAbsentWaitMin: 15,
    customerAbsentAvailableAt: status === 'picked' ? new Date(Date.now() + 10 * 60_000).toISOString() : null,
    cancellationCompensation: null,
    ...extra,
  };
}

function conflict(code: 'ALREADY_CLAIMED' | 'ORDER_CLOSED') {
  const error = code === 'ALREADY_CLAIMED'
    ? 'Already claimed or not available'
    : 'Pedido cancelado; a corrida não está mais disponível';
  return { response: { status: 409, data: { error, code } } };
}

// ── ofertas ──────────────────────────────────────────────────────────────────

export interface MotoboyOfferDriver {
  /**
   * Monta a aba Corridas com o motoboy ONLINE e `ctx.server.offers` no pool.
   * Resolve quando a tela está parada (nenhuma leitura do pool pendente).
   */
  mount(): Promise<void>;
  /** A oferta aparece para o motoboy? */
  isOffered(deliveryId: string): boolean;
  /** A tela deixa aceitar esta oferta agora (botão presente e habilitado)? */
  canAccept(deliveryId: string): boolean;
  /** Toca em aceitar. Se o botão não estiver na tela ou estiver desabilitado, não faz nada. */
  accept(deliveryId: string): Promise<void>;
  /** "Pular"/"Recusar" a oferta. */
  skip(deliveryId: string): Promise<void>;
  /** Id da corrida que a tela abriu (navegação) depois do aceite, ou null. */
  openedRideId(): string | null;
}

export function runMotoboyOfferContract(screenName: string, getCtx: () => MotoboyCtx, driver: MotoboyOfferDriver): void {
  describe(`Etapa 0 · ofertas do motoboy (${screenName})`, () => {
    beforeEach(() => {
      const { api, server } = getCtx();
      server.offers = [offer('d-a'), offer('d-b')];
      server.ride = null;
      api.post.mockReset();
      api.post.mockImplementation((url: string) => {
        const m = /^\/deliveries\/([^/]+)\/claim$/.exec(url);
        if (m) {
          return Promise.resolve({
            data: { ...offer(m[1]), status: 'assigned', motoboyId: CONTRACT_MOTOBOY_ID, pinRetirada: CONTRACT_PICKUP_PIN },
          });
        }
        return Promise.resolve({ data: {} });
      });
    });

    test('aceitar: um POST /deliveries/:id/claim, só da oferta escolhida, e a tela abre essa corrida', async () => {
      const { api } = getCtx();
      await driver.mount();
      expect(driver.canAccept('d-b')).toBe(true);
      await driver.accept('d-b');
      await waitFor(() => expect(driver.openedRideId()).toBe('d-b'));
      await flush();
      expect(callsTo(api.post, '/deliveries/d-b/claim')).toHaveLength(1);
      expect(callsTo(api.post, '/deliveries/d-a/claim')).toHaveLength(0);
    });

    test('toque duplo com o aceite em voo: um único POST', async () => {
      const { api } = getCtx();
      let release: (v: any) => void = () => {};
      api.post.mockImplementation((url: string) =>
        url === '/deliveries/d-b/claim'
          ? new Promise((r) => { release = r; })
          : Promise.resolve({ data: {} }),
      );
      await driver.mount();
      await driver.accept('d-b');
      await driver.accept('d-b');
      expect(callsTo(api.post, '/deliveries/d-b/claim')).toHaveLength(1);
      await act(async () => {
        release({ data: { ...offer('d-b'), status: 'assigned', motoboyId: CONTRACT_MOTOBOY_ID } });
      });
      await waitFor(() => expect(driver.openedRideId()).toBe('d-b'));
      expect(callsTo(api.post, '/deliveries/d-b/claim')).toHaveLength(1);
    });

    test.each(['ALREADY_CLAIMED', 'ORDER_CLOSED'] as const)(
      '409 %s: a oferta some, a tela relê o pool, ela não volta e nenhuma corrida abre',
      async (code) => {
        const { api, server } = getCtx();
        await driver.mount();
        const before = callsTo(api.get, '/deliveries/available').length;
        api.post.mockImplementation((url: string) =>
          url === '/deliveries/d-b/claim' ? Promise.reject(conflict(code)) : Promise.resolve({ data: {} }),
        );
        server.offers = [offer('d-a')]; // o servidor já não tem a d-b
        await driver.accept('d-b');
        await waitFor(() => expect(callsTo(api.get, '/deliveries/available').length).toBeGreaterThan(before));
        await waitFor(() => expect(driver.isOffered('d-b')).toBe(false));
        await flush(400);
        expect(driver.isOffered('d-b')).toBe(false);
        expect(driver.isOffered('d-a')).toBe(true);
        expect(driver.openedRideId()).toBeNull();
      },
    );

    test('erro que não é 409 (500): a oferta continua e nenhuma corrida abre', async () => {
      const { api } = getCtx();
      await driver.mount();
      api.post.mockImplementation((url: string) =>
        url === '/deliveries/d-b/claim'
          ? Promise.reject({ response: { status: 500, data: { error: 'Failed to claim delivery' } } })
          : Promise.resolve({ data: {} }),
      );
      await driver.accept('d-b');
      await waitFor(() => expect(callsTo(api.post, '/deliveries/d-b/claim')).toHaveLength(1));
      await flush(400);
      expect(driver.isOffered('d-b')).toBe(true);
      expect(driver.openedRideId()).toBeNull();
    });

    test('pular é local: a oferta some sem nenhuma chamada de escrita', async () => {
      const { api } = getCtx();
      await driver.mount();
      await driver.skip('d-a');
      await waitFor(() => expect(driver.isOffered('d-a')).toBe(false));
      expect(driver.isOffered('d-b')).toBe(true);
      expect(api.post).not.toHaveBeenCalled();
    });
  });
}
