/**
 * D2 · Etapa 0 — contratos do motoboy na aba Corridas e na corrida.
 * As expectativas são sobre CHAMADAS DE API, EVENTOS DE SOCKET e o que o motoboy vê, nunca
 * sobre estrutura ou texto de botão. Cada tela (a atual e, depois, a do DS v2) implementa um
 * driver e chama o `run…Contract` correspondente.
 *
 * Teste de comportamento da Etapa 0: as expectativas daqui são INTOCÁVEIS.
 */
import { act, waitFor } from '@testing-library/react';
import { ApiMock, SocketHarness, MotoboyServer, GeoHarness, callsTo, flush, spyConsole } from './motoboyHarness';

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

// ── corrida ──────────────────────────────────────────────────────────────────

export type GiveBackCode = 'motoboy_unavailable' | 'delivery_failed' | 'address_invalid';

export interface MotoboyRideDriver {
  /** Monta a tela da corrida `RIDE_ID` com `ctx.server.ride` e resolve quando ela aparece. */
  mount(): Promise<void>;
  /** 'pickup' = mostrando o PIN de retirada; 'deliver' = pedindo o PIN do cliente; 'other' = nenhum dos dois. */
  stage(): 'pickup' | 'deliver' | 'other';
  /** O PIN de retirada que o motoboy está vendo (só os dígitos), ou null. */
  visiblePickupPin(): string | null;
  /** Digita o PIN do cliente e toca em finalizar (se o botão estiver desabilitado, o toque não faz nada). */
  submitDeliveryPin(pin: string): Promise<void>;
  /** A tela mostra a corrida como concluída (ou saiu dela para seguir)? */
  completed(): boolean;
  /** Abre "devolver/problema", escolhe o motivo e confirma devolver a corrida. */
  giveBack(code: GiveBackCode): Promise<void>;
  /** Todo o texto que o motoboy vê agora (tela + avisos). */
  shownText(): string;
}

export function runMotoboyRideContract(screenName: string, getCtx: () => MotoboyCtx, driver: MotoboyRideDriver): void {
  describe(`Etapa 0 · corrida do motoboy (${screenName})`, () => {
    beforeEach(() => {
      const { api } = getCtx();
      api.post.mockReset();
      api.post.mockResolvedValue({ status: 200, data: { success: true } });
    });

    describe('retirada', () => {
      test('mostra o PIN de retirada que veio do servidor', async () => {
        getCtx().server.ride = ride('assigned');
        await driver.mount();
        expect(driver.stage()).toBe('pickup');
        expect(driver.visiblePickupPin()).toBe(CONTRACT_PICKUP_PIN);
      });

      test('a loja valida o PIN (delivery:pin_validated): a tela passa sozinha para a entrega', async () => {
        const { server, socket } = getCtx();
        server.ride = ride('assigned');
        await driver.mount();
        server.ride = ride('picked');
        socket.fire('delivery:pin_validated', { deliveryId: RIDE_ID, orderId: 'order-ride-000123' });
        await waitFor(() => expect(driver.stage()).toBe('deliver'));
        expect(driver.visiblePickupPin()).toBeNull();
      });

      test('evento de outra corrida não muda a tela', async () => {
        const { server, socket } = getCtx();
        server.ride = ride('assigned');
        await driver.mount();
        socket.fire('delivery:pin_validated', { deliveryId: 'd-outra', orderId: 'order-outra' });
        await act(async () => { await flush(100); });
        expect(driver.stage()).toBe('pickup');
      });

      test('socket voltou de uma queda: relê GET /deliveries/:id', async () => {
        const { server, socket, api } = getCtx();
        server.ride = ride('assigned');
        await driver.mount();
        const before = callsTo(api.get, `/deliveries/${RIDE_ID}`).length;
        socket.reconnect();
        await waitFor(() => expect(callsTo(api.get, `/deliveries/${RIDE_ID}`).length).toBeGreaterThan(before));
      });
    });

    describe('entrega com o PIN do cliente', () => {
      test('PIN com menos de 5 dígitos não é enviado', async () => {
        getCtx().server.ride = ride('picked');
        await driver.mount();
        await driver.submitDeliveryPin('123');
        await act(async () => { await flush(100); });
        expect(callsTo(getCtx().api.post, `/deliveries/${RIDE_ID}/finalizar`)).toHaveLength(0);
      });

      test('PIN certo: um POST /finalizar com { pin } e a tela fica concluída', async () => {
        const { server, api } = getCtx();
        server.ride = ride('picked');
        api.post.mockImplementation((url: string) => {
          if (url === `/deliveries/${RIDE_ID}/finalizar`) server.ride = ride('delivered');
          return Promise.resolve({ status: 200, data: { success: true } });
        });
        await driver.mount();
        await driver.submitDeliveryPin(CONTRACT_DELIVERY_PIN);
        await waitFor(() => expect(driver.completed()).toBe(true));
        const calls = callsTo(api.post, `/deliveries/${RIDE_ID}/finalizar`);
        expect(calls).toHaveLength(1);
        expect(calls[0][1]).toEqual({ pin: CONTRACT_DELIVERY_PIN });
      });

      test('PIN errado: mostra a mensagem do servidor, nada concluído e o PIN fora dos logs', async () => {
        const con = spyConsole();
        try {
          getCtx().api.post.mockImplementation((url: string) =>
            url === `/deliveries/${RIDE_ID}/finalizar`
              ? Promise.reject({ response: { status: 400, data: { error: 'PIN inválido' } } })
              : Promise.resolve({ status: 200, data: {} }),
          );
          getCtx().server.ride = ride('picked');
          await driver.mount();
          await driver.submitDeliveryPin(CONTRACT_DELIVERY_PIN);
          await waitFor(() => expect(driver.shownText()).toContain('PIN inválido'));
          expect(driver.completed()).toBe(false);
          expect(con.text()).not.toContain(CONTRACT_DELIVERY_PIN);
        } finally {
          con.restore();
        }
      });

      test('PIN travado (429): mostra a mensagem do servidor com o tempo', async () => {
        getCtx().api.post.mockImplementation((url: string) =>
          url === `/deliveries/${RIDE_ID}/finalizar`
            ? Promise.reject({
                response: { status: 429, data: { error: 'Muitas tentativas de PIN. Tente novamente em 15 min.', code: 'PIN_LOCKED' } },
              })
            : Promise.resolve({ status: 200, data: {} }),
        );
        getCtx().server.ride = ride('picked');
        await driver.mount();
        await driver.submitDeliveryPin(CONTRACT_DELIVERY_PIN);
        await waitFor(() => expect(driver.shownText()).toMatch(/Muitas tentativas de PIN\. Tente novamente em 15 min\./));
        expect(driver.completed()).toBe(false);
      });
    });

    describe('devolver a corrida', () => {
      test('antes de retirar: um POST /reject com o motivo escolhido', async () => {
        const { server, api } = getCtx();
        server.ride = ride('assigned');
        await driver.mount();
        await driver.giveBack('motoboy_unavailable');
        await waitFor(() => expect(callsTo(api.post, `/deliveries/${RIDE_ID}/reject`)).toHaveLength(1));
        const body = callsTo(api.post, `/deliveries/${RIDE_ID}/reject`)[0][1];
        expect(body.reasonCode).toBe('motoboy_unavailable');
        expect(typeof body.reason).toBe('string');
        expect(body.reason.trim().length).toBeGreaterThan(0);
      });

      test('depois de retirar: mostra o código de devolução que o servidor gerou', async () => {
        const { server, api } = getCtx();
        server.ride = ride('picked');
        api.post.mockImplementation((url: string) =>
          url === `/deliveries/${RIDE_ID}/reject`
            ? Promise.resolve({
                status: 202,
                data: { success: true, isPending: true, statusDevolucao: 'aguardando_confirmacao', pinDevolucao: CONTRACT_RETURN_PIN },
              })
            : Promise.resolve({ status: 200, data: {} }),
        );
        await driver.mount();
        await driver.giveBack('delivery_failed');
        await waitFor(() => expect(driver.shownText()).toContain(CONTRACT_RETURN_PIN));
        expect(callsTo(api.post, `/deliveries/${RIDE_ID}/reject`)).toHaveLength(1);
      });

      test('servidor recusa: mostra a mensagem do servidor', async () => {
        const { server, api } = getCtx();
        server.ride = ride('assigned');
        api.post.mockImplementation((url: string) =>
          url === `/deliveries/${RIDE_ID}/reject`
            ? Promise.reject({ response: { status: 400, data: { error: 'Entrega não pode ser rejeitada no estado: delivered' } } })
            : Promise.resolve({ status: 200, data: {} }),
        );
        await driver.mount();
        await driver.giveBack('address_invalid');
        await waitFor(() => expect(driver.shownText()).toContain('Entrega não pode ser rejeitada no estado: delivered'));
      });
    });

    test('corrida cancelada (delivery:cancelled desta corrida): mostra o motivo', async () => {
      const { server, socket } = getCtx();
      server.ride = ride('picked');
      await driver.mount();
      server.ride = ride('cancelled');
      socket.fire('delivery:cancelled', {
        deliveryId: RIDE_ID, status: 'cancelled', reason: 'Cliente desistiu do pedido', cancellationCompensation: null,
      });
      await waitFor(() => expect(driver.shownText()).toContain('Cliente desistiu do pedido'));
    });

    describe('GPS', () => {
      test('envia delivery:location_updated no máximo a cada 5 s e só se moveu ~10 m', async () => {
        const { server, socket, geo } = getCtx();
        server.ride = ride('assigned');
        await driver.mount();
        const clock = jest.spyOn(Date, 'now');
        try {
          let t = 1_700_000_000_000;
          clock.mockImplementation(() => t);
          const sent = () => socket.api.emit.mock.calls.filter((c) => c[0] === 'delivery:location_updated');

          geo.push(-22.9, -43.2, 8);
          expect(sent()).toHaveLength(1);
          expect(sent()[0][1]).toEqual(expect.objectContaining({ deliveryId: RIDE_ID, latitude: -22.9, longitude: -43.2, accuracy: 8 }));
          expect(typeof sent()[0][1].timestamp).toBe('string');

          t += 1_000;
          geo.push(-22.901, -43.2);
          expect(sent()).toHaveLength(1); // menos de 5 s

          t += 6_000;
          geo.push(-22.902, -43.2);
          expect(sent()).toHaveLength(2);

          t += 6_000;
          geo.push(-22.902, -43.2);
          expect(sent()).toHaveLength(2); // não se moveu
        } finally {
          clock.mockRestore();
        }
      });

      test('corrida entregue não envia posição', async () => {
        const { server, socket, geo } = getCtx();
        server.ride = ride('delivered');
        await driver.mount();
        geo.push(-22.9, -43.2);
        expect(socket.api.emit.mock.calls.filter((c) => c[0] === 'delivery:location_updated')).toHaveLength(0);
      });
    });
  });
}

// ── cliente ausente (sem tela atual: roda a partir da corrida nova, P3) ─────

export interface MotoboyAbsentDriver {
  /** Monta a tela da corrida `RIDE_ID` (status `picked`) com `ctx.server.ride`. */
  mount(): Promise<void>;
  /** A tela deixa encerrar como cliente ausente agora? */
  canMarkAbsent(): boolean;
  /**
   * Faz o gesto completo de "Encerrar como ausente" (inclui confirmação, se houver).
   * Se o caminho não estiver na tela ou estiver desabilitado, não faz nada.
   */
  markAbsent(): Promise<void>;
  shownText(): string;
}

export function runMotoboyAbsentContract(screenName: string, getCtx: () => MotoboyCtx, driver: MotoboyAbsentDriver): void {
  describe(`Etapa 0 · cliente ausente (${screenName})`, () => {
    const url = `/deliveries/${RIDE_ID}/cliente-ausente`;
    const past = () => new Date(Date.now() - 60_000).toISOString();

    beforeEach(() => {
      const { api } = getCtx();
      api.post.mockReset();
      api.post.mockResolvedValue({ status: 200, data: { success: true } });
    });

    test('antes da espera (o servidor diz que libera no futuro): não deixa encerrar', async () => {
      getCtx().server.ride = ride('picked', { customerAbsentAvailableAt: new Date(Date.now() + 10 * 60_000).toISOString() });
      await driver.mount();
      expect(driver.canMarkAbsent()).toBe(false);
      await driver.markAbsent();
      await act(async () => { await flush(100); });
      expect(callsTo(getCtx().api.post, url)).toHaveLength(0);
    });

    test('depois da espera: um POST /cliente-ausente e mostra o código de devolução', async () => {
      const { server, api } = getCtx();
      server.ride = ride('picked', { customerAbsentAvailableAt: past() });
      api.post.mockImplementation((u: string) =>
        u === url
          ? Promise.resolve({ status: 200, data: { success: true, status: 'cancelado', statusDevolucao: 'aguardando_confirmacao', pinDevolucao: CONTRACT_RETURN_PIN } })
          : Promise.resolve({ status: 200, data: {} }),
      );
      await driver.mount();
      expect(driver.canMarkAbsent()).toBe(true);
      await driver.markAbsent();
      await waitFor(() => expect(driver.shownText()).toContain(CONTRACT_RETURN_PIN));
      expect(callsTo(api.post, url)).toHaveLength(1);
    });

    test('o servidor diz que ainda falta (400 com remainingMs): mostra o tempo restante do servidor', async () => {
      const { server, api } = getCtx();
      server.ride = ride('picked', { customerAbsentAvailableAt: past() });
      api.post.mockImplementation((u: string) =>
        u === url
          ? Promise.reject({ response: { status: 400, data: { error: 'Espera mínima de 15 min ainda não cumprida', waitMinutesRequired: 15, remainingMs: 120_000 } } })
          : Promise.resolve({ status: 200, data: {} }),
      );
      await driver.mount();
      await driver.markAbsent();
      await waitFor(() => expect(driver.shownText()).toMatch(/\b2\s*min|\b0?2:00\b/));
      expect(driver.shownText()).not.toContain(CONTRACT_RETURN_PIN);
    });

    test('409: relê a corrida', async () => {
      const { server, api } = getCtx();
      server.ride = ride('picked', { customerAbsentAvailableAt: past() });
      api.post.mockImplementation((u: string) =>
        u === url
          ? Promise.reject({ response: { status: 409, data: { error: 'Pedido já foi cancelado ou está em processamento' } } })
          : Promise.resolve({ status: 200, data: {} }),
      );
      await driver.mount();
      const before = callsTo(api.get, `/deliveries/${RIDE_ID}`).length;
      await driver.markAbsent();
      await waitFor(() => expect(callsTo(api.get, `/deliveries/${RIDE_ID}`).length).toBeGreaterThan(before));
    });
  });
}
