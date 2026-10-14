/**
 * D2 · Etapa 0 — contrato do saque do motoboy: custódia (saque, mínimo, erro do servidor),
 * direto sem saque da custódia e saldo do modo anterior. Expectativas sobre CHAMADAS DE API
 * e o que o motoboy vê. Cada tela implementa um driver e chama o `run…Contract`.
 *
 * Teste de comportamento da Etapa 0: as expectativas daqui são INTOCÁVEIS.
 */
import { act, waitFor } from '@testing-library/react';
import { ApiMock, callsTo, flush } from './motoboyHarness';
import { CONTRACT_MOTOBOY_ID } from './motoboyRideContract';

export interface WalletFixture {
  mode: 'custodia' | 'direto';
  /** Disponível para saque (repasses liberados). */
  available: number;
  /** Saque mínimo do motoboy configurado (`motoboyMinimumWithdraw`). */
  minimum: number;
  /** Modo direto com saldo da custódia (`useCustodyLeftover`). */
  custodyLeftover?: boolean;
  /** Linhas de `GET /withdrawals/my-withdrawals`. */
  withdrawals?: any[];
}

export interface MotoboyWithdrawDriver {
  /** Monta a tela de ganhos do motoboy com a fixture e resolve quando ela terminou de carregar. */
  mount(f: WalletFixture): Promise<void>;
  /** Existe um caminho de saque habilitado na tela? */
  canWithdraw(): boolean;
  /** Abre o saque, escolhe "tudo" e confirma. Se não houver caminho de saque habilitado, não faz nada. */
  withdrawAll(): Promise<void>;
  /** Todo o texto que o motoboy vê agora (tela + avisos/toasts). */
  shownText(): string;
}

/** Leituras que provam que a tela atualizou o saldo depois do saque. */
export const RELOAD_URLS = ['/payouts/my', '/payouts/my/summary', `/wallets/motoboy/${CONTRACT_MOTOBOY_ID}`];

const reloads = (api: ApiMock) => RELOAD_URLS.reduce((n, u) => n + callsTo(api.get, u).length, 0);
const settle = (ms?: number) => act(async () => { await flush(ms); });

export function runMotoboyWithdrawContract(screenName: string, getApi: () => ApiMock, driver: MotoboyWithdrawDriver): void {
  describe(`Etapa 0 · saque do motoboy (${screenName})`, () => {
    beforeEach(() => {
      const api = getApi();
      api.post.mockReset();
      api.post.mockResolvedValue({ status: 200, data: { success: true, withdrawal: { amount: 100 } } });
    });

    test('custódia: sacar tudo faz um POST /withdrawals/request com "all" ou com o valor disponível', async () => {
      await driver.mount({ mode: 'custodia', available: 100, minimum: 10 });
      expect(driver.canWithdraw()).toBe(true);
      await driver.withdrawAll();
      const api = getApi();
      await waitFor(() => expect(callsTo(api.post, '/withdrawals/request')).toHaveLength(1));
      await settle();
      expect(callsTo(api.post, '/withdrawals/request')).toHaveLength(1);
      const amount = callsTo(api.post, '/withdrawals/request')[0][1]?.amount;
      expect(amount === 'all' || amount === 100).toBe(true);
    });

    test('custódia: saque aceito relê o saldo', async () => {
      await driver.mount({ mode: 'custodia', available: 100, minimum: 10 });
      const api = getApi();
      const before = reloads(api);
      await driver.withdrawAll();
      await waitFor(() => expect(reloads(api)).toBeGreaterThan(before));
    });

    test('custódia: o servidor recusa (400) e a mensagem dele aparece', async () => {
      getApi().post.mockRejectedValue({
        response: { status: 400, data: { error: 'Cadastre sua chave Pix em Dados de recebimento para sacar.', code: 'PIX_KEY_MISSING' } },
      });
      await driver.mount({ mode: 'custodia', available: 100, minimum: 10 });
      await driver.withdrawAll();
      await waitFor(() => expect(driver.shownText()).toContain('Cadastre sua chave Pix em Dados de recebimento para sacar.'));
    });

    test('custódia: abaixo do mínimo, o mínimo aparece e nenhum saque é aceito', async () => {
      getApi().post.mockRejectedValue({
        response: { status: 400, data: { error: 'O saque mínimo é R$ 20,00', code: 'BELOW_MINIMUM_WITHDRAW', minimum: 20 } },
      });
      await driver.mount({ mode: 'custodia', available: 15, minimum: 20 });
      if (driver.canWithdraw()) await driver.withdrawAll();
      await waitFor(() => expect(driver.shownText()).toMatch(/R\$\s?20,00/));
      expect(callsTo(getApi().post, '/withdrawals/request').length).toBeLessThanOrEqual(1);
    });

    test('custódia sem saldo: não oferece saque', async () => {
      await driver.mount({ mode: 'custodia', available: 0, minimum: 10 });
      expect(driver.canWithdraw()).toBe(false);
    });

    test('direto sem saldo do modo anterior: sem saque e sem ler as rotas da custódia', async () => {
      await driver.mount({ mode: 'direto', available: 0, minimum: 10, custodyLeftover: false });
      expect(driver.canWithdraw()).toBe(false);
      await driver.withdrawAll();
      await settle(100);
      const api = getApi();
      expect(callsTo(api.post, '/withdrawals/request')).toHaveLength(0);
      const urls = api.get.mock.calls.map((c) => String(c[0]));
      expect(urls.filter((u) => u.startsWith('/wallets/motoboy'))).toEqual([]);
      expect(urls.filter((u) => u.startsWith('/withdrawals/my-withdrawals'))).toEqual([]);
    });

    test('direto com saldo do modo anterior: oferece o saque por POST /withdrawals/request', async () => {
      await driver.mount({ mode: 'direto', available: 30, minimum: 10, custodyLeftover: true });
      expect(driver.canWithdraw()).toBe(true);
      await driver.withdrawAll();
      await waitFor(() => expect(callsTo(getApi().post, '/withdrawals/request')).toHaveLength(1));
    });
  });
}

/** Sem tela atual: a tela de hoje não olha `uncertainAt`. Roda a partir da tela Ganhos nova (P4). */
export function runMotoboyWithdrawUncertainContract(screenName: string, getApi: () => ApiMock, driver: MotoboyWithdrawDriver): void {
  describe(`Etapa 0 · saque em conferência (${screenName})`, () => {
    test('com um saque em conferência (uncertainAt), não deixa pedir outro e avisa', async () => {
      const api = getApi();
      api.post.mockReset();
      api.post.mockResolvedValue({ status: 200, data: { success: true } });
      await driver.mount({
        mode: 'custodia', available: 100, minimum: 10,
        withdrawals: [{ _id: 'w-unc', status: 'approved', amount: 40, uncertainAt: '2026-10-13T12:00:00.000Z', requestedAt: '2026-10-13T11:58:00.000Z' }],
      });
      expect(driver.canWithdraw()).toBe(false);
      await driver.withdrawAll();
      await settle(100);
      expect(callsTo(api.post, '/withdrawals/request')).toHaveLength(0);
      expect(driver.shownText()).toMatch(/confer[êe]ncia/i);
    });
  });
}
