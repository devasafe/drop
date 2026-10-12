/**
 * D1 · Etapa 0 — contrato das ações da loja sobre um pedido: aceite, recusa com motivo e
 * PIN de retirada. As expectativas são sobre CHAMADAS DE API e EFEITOS, nunca sobre texto
 * de botão ou estrutura: cada tela (a atual `store-dashboard` e, depois, Agora/Pedido do
 * DS v2) implementa um `SellerOrderDriver` e chama `runSellerOrderContract`.
 *
 * Teste de comportamento da Etapa 0: as expectativas daqui são INTOCÁVEIS.
 */
import { screen, waitFor } from '@testing-library/react';

export type ApiMock = { get: jest.Mock; post: jest.Mock; put: jest.Mock };
export type RejectReasonCode = 'store_closed' | 'store_busy' | 'not_available' | 'payment_issue' | 'other';

export interface SellerOrderDriver {
  /** Monta a tela com `orders` vindo de GET /stores/dashboard e espera a lista aparecer. */
  mount(orders: any[]): Promise<void>;
  /** O pedido aparece na lista de pedidos em andamento? */
  isListed(orderId: string): boolean;
  /** A tela oferece aceitar este pedido agora? */
  canAccept(orderId: string): boolean;
  /** Faz o gesto completo de aceite (inclui a confirmação que a tela pedir). */
  accept(orderId: string): Promise<void>;
  /** Abre a recusa, escolhe o motivo (e digita o texto se for "other") e confirma. */
  reject(orderId: string, code: RejectReasonCode, customText?: string): Promise<void>;
  /** Digita o PIN de retirada completo e faz o envio do jeito que a tela faz. */
  submitPickupPin(orderId: string, pin: string): Promise<void>;
}

export const CONTRACT_PIN = '54321';

export function newOrder(id = 'o-new'): any {
  return {
    _id: id,
    status: 'criado',
    paymentStatus: 'paid',
    customerName: 'Ana',
    totalValue: 42,
    subtotal: 35,
    deliveryFee: 7,
    deliveryDistance: 2,
    products: [{ productId: 'p1', productName: 'X-Burger', quantity: 1, price: 35 }],
    createdAt: new Date().toISOString(),
    paidAt: new Date().toISOString(),
  };
}

export function assignedOrder(id = 'o-pin', deliveryId = 'd-pin'): any {
  return {
    ...newOrder(id),
    status: 'aguardando_motoboy',
    acceptedAt: new Date().toISOString(),
    delivery: { _id: deliveryId, status: 'assigned', motoboyId: 'm-1', motoboyName: 'Caio' },
  };
}

/** Chamadas de um mock de API cujo 1º argumento é exatamente `url`. */
export function callsTo(fn: jest.Mock, url: string): any[][] {
  return fn.mock.calls.filter((c) => c[0] === url);
}

const flush = () => new Promise((r) => setTimeout(r, 30));

function text(args: any[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    })
    .join(' ');
}

const CODES_WITH_FIXED_TEXT: RejectReasonCode[] = ['store_closed', 'store_busy', 'not_available', 'payment_issue'];

export function runSellerOrderContract(screenName: string, getApi: () => ApiMock, driver: SellerOrderDriver): void {
  describe(`Etapa 0 · ações da loja no pedido (${screenName})`, () => {
    beforeEach(() => {
      const api = getApi();
      api.post.mockReset();
      api.post.mockResolvedValue({ data: {} });
    });

    describe('aceite', () => {
      test('chama POST /orders/:id/accept uma vez, só para o pedido escolhido', async () => {
        await driver.mount([newOrder('o-a'), newOrder('o-b')]);
        await driver.accept('o-b');
        const api = getApi();
        await waitFor(() => expect(callsTo(api.post, '/orders/o-b/accept')).toHaveLength(1));
        await flush();
        expect(callsTo(api.post, '/orders/o-b/accept')).toHaveLength(1);
        expect(callsTo(api.post, '/orders/o-a/accept')).toHaveLength(0);
      });

      test('depois do aceite, o pedido não oferece aceitar de novo', async () => {
        await driver.mount([newOrder('o-a')]);
        expect(driver.canAccept('o-a')).toBe(true);
        await driver.accept('o-a');
        await waitFor(() => expect(driver.canAccept('o-a')).toBe(false));
      });
    });

    describe('recusa', () => {
      test.each(CODES_WITH_FIXED_TEXT)('motivo %s: envia o reasonCode escolhido e um reason não vazio', async (code) => {
        await driver.mount([newOrder('o-r')]);
        await driver.reject('o-r', code);
        const api = getApi();
        await waitFor(() => expect(callsTo(api.post, '/orders/o-r/reject')).toHaveLength(1));
        const body = callsTo(api.post, '/orders/o-r/reject')[0][1];
        expect(body.reasonCode).toBe(code);
        expect(typeof body.reason).toBe('string');
        expect(body.reason.trim().length).toBeGreaterThan(0);
      });

      test('"other" envia o texto digitado como reason', async () => {
        await driver.mount([newOrder('o-r')]);
        await driver.reject('o-r', 'other', 'Acabou o gás');
        const api = getApi();
        await waitFor(() => expect(callsTo(api.post, '/orders/o-r/reject')).toHaveLength(1));
        expect(callsTo(api.post, '/orders/o-r/reject')[0][1]).toEqual({ reason: 'Acabou o gás', reasonCode: 'other' });
      });

      test('recusa aceita pelo servidor tira só aquele pedido da lista', async () => {
        await driver.mount([newOrder('o-r'), newOrder('o-fica')]);
        await driver.reject('o-r', 'store_busy');
        await waitFor(() => expect(driver.isListed('o-r')).toBe(false));
        expect(driver.isListed('o-fica')).toBe(true);
      });
    });

    describe('PIN de retirada', () => {
      test('envia o PIN completo uma vez para POST /deliveries/:id/validar-pin-retirada', async () => {
        await driver.mount([assignedOrder('o-p', 'd-p')]);
        await driver.submitPickupPin('o-p', CONTRACT_PIN);
        const api = getApi();
        await waitFor(() => expect(callsTo(api.post, '/deliveries/d-p/validar-pin-retirada')).toHaveLength(1));
        await flush();
        expect(callsTo(api.post, '/deliveries/d-p/validar-pin-retirada')).toHaveLength(1);
        expect(callsTo(api.post, '/deliveries/d-p/validar-pin-retirada')[0][1]).toEqual({ pinRetirada: CONTRACT_PIN });
      });

      test('PIN aceito: a tela recarrega os pedidos (GET /stores/dashboard de novo)', async () => {
        await driver.mount([assignedOrder('o-p', 'd-p')]);
        const api = getApi();
        const before = callsTo(api.get, '/stores/dashboard').length;
        await driver.submitPickupPin('o-p', CONTRACT_PIN);
        await waitFor(() => expect(callsTo(api.get, '/stores/dashboard').length).toBeGreaterThan(before));
      });

      test('PIN errado: mostra o erro do servidor e o PIN não aparece em nenhum log', async () => {
        const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
          jest.spyOn(console, m).mockImplementation(() => {}),
        );
        try {
          getApi().post.mockImplementation((url: string) =>
            url.includes('validar-pin-retirada')
              ? Promise.reject({ response: { status: 400, data: { error: 'PIN de retirada inválido' } } })
              : Promise.resolve({ data: {} }),
          );
          await driver.mount([assignedOrder('o-p', 'd-p')]);
          await driver.submitPickupPin('o-p', CONTRACT_PIN);
          expect(await screen.findByText('PIN de retirada inválido')).toBeInTheDocument();
          const logged = spies.flatMap((s) => s.mock.calls.map((args) => text(args))).join('\n');
          expect(logged).not.toContain(CONTRACT_PIN);
        } finally {
          spies.forEach((s) => s.mockRestore());
        }
      });

      test('PIN travado (429): mostra a mensagem do servidor', async () => {
        getApi().post.mockImplementation((url: string) =>
          url.includes('validar-pin-retirada')
            ? Promise.reject({
                response: { status: 429, data: { error: 'Muitas tentativas de PIN. Tente novamente em 15 min.', code: 'PIN_LOCKED' } },
              })
            : Promise.resolve({ data: {} }),
        );
        await driver.mount([assignedOrder('o-p', 'd-p')]);
        await driver.submitPickupPin('o-p', CONTRACT_PIN);
        expect(await screen.findByText(/Muitas tentativas de PIN/)).toBeInTheDocument();
      });
    });
  });
}
