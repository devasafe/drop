/**
 * Sandbox: o corpo do pedido de autorização do Asaas vai para o log (só os nomes dos campos,
 * ids e valores — chave Pix, documento e conta mascarados), para conferir o formato real.
 * Com a URL de produção do Asaas, nada é logado.
 */
import request from 'supertest';
import app from '../app';
import logger from '../config/logger';
import env from '../config/env';
import { authPayloadShape } from '../controllers/transferAuthController';

const ORIGINAL_ASAAS_URL = env.ASAAS_API_URL;
afterEach(() => {
  (env as any).ASAAS_API_URL = ORIGINAL_ASAAS_URL;
  jest.restoreAllMocks();
});

const BODY = {
  type: 'TRANSFER',
  transfer: {
    id: 'tra_abc123',
    value: 12.5,
    externalReference: 'cmv0spu0a00047dc1rcjf1oev',
    pixAddressKey: 'cliente-a00001@pix.bcb.gov.br',
    bankAccount: { ownerName: 'Fulano', cpfCnpj: '12345678909', account: '123456', pixAddressKey: '11987654321' },
    status: 'PENDING',
  },
};

const sandboxCalls = (spy: jest.SpyInstance) => spy.mock.calls.filter((c) => c[0] === '[transfer-auth][sandbox] corpo recebido');

describe('t56 — corpo da autorização no log do sandbox', () => {
  it('authPayloadShape mantém campos, ids, valor e status; mascara chave, documento e conta', () => {
    const shape: any = authPayloadShape(BODY);
    expect(shape.type).toBe('TRANSFER');
    expect(shape.transfer.id).toBe('tra_abc123');
    expect(shape.transfer.value).toBe(12.5);
    expect(shape.transfer.externalReference).toBe('cmv0spu0a00047dc1rcjf1oev');
    expect(shape.transfer.status).toBe('PENDING');
    expect(Object.keys(shape.transfer.bankAccount).sort()).toEqual(['account', 'cpfCnpj', 'ownerName', 'pixAddressKey']);
    const dump = JSON.stringify(shape);
    expect(dump).not.toContain('cliente-a00001');
    expect(dump).not.toContain('12345678909');
    expect(dump).not.toContain('11987654321');
    expect(dump).not.toContain('Fulano');
  });

  it('com ASAAS_API_URL de sandbox, loga o formato do corpo', async () => {
    (env as any).ASAAS_API_URL = 'https://sandbox.asaas.com/api/v3';
    const spy = jest.spyOn(logger as any, 'info');
    await request(app).post('/webhooks/asaas/loja/loja-inexistente/autorizacao').send(BODY);
    const calls = sandboxCalls(spy);
    expect(calls.length).toBe(1);
    expect(calls[0][1]).toMatchObject({ storeId: 'loja-inexistente', body: { type: 'TRANSFER', transfer: { id: 'tra_abc123' } } });
    expect(JSON.stringify(calls)).not.toContain('cliente-a00001');
  });

  it('com ASAAS_API_URL de produção, não loga o corpo', async () => {
    (env as any).ASAAS_API_URL = 'https://api.asaas.com/v3';
    const spy = jest.spyOn(logger as any, 'info');
    await request(app).post('/webhooks/asaas/loja/loja-inexistente/autorizacao').send(BODY);
    expect(sandboxCalls(spy).length).toBe(0);
  });
});
