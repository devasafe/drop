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
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { sha256Hex } from '../services/asaasLoja/webhook';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { ownerIdForStore } from './helpers/storeOwner';

const DOMAIN = '@saas56.test';
const ORIGINAL_ASAAS_URL = env.ASAAS_API_URL;
afterEach(async () => {
  (env as any).ASAAS_API_URL = ORIGINAL_ASAAS_URL;
  jest.restoreAllMocks();
  await cleanupUsersByEmailDomain(DOMAIN);
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

  it('aviso comum de webhook (tem `event`) na URL de autorização → REFUSED WRONG_ENDPOINT + alerta ao admin', async () => {
    const TOKEN = 't'.repeat(48);
    const s = await prisma.store.create({ data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja T56', isOpen: true } });
    await prisma.storeAsaasAccount.create({
      data: { storeId: s.id, apiKeyEncrypted: encryptSensitiveData('$aact_hmlg_X56'), apiKeyLast4: 'X56', environment: 'sandbox', status: 'valid', authWebhookTokenHash: sha256Hex(TOKEN) },
    });
    const socketEmitter = require('../utils/socketEmitter');
    const alert = jest.spyOn(socketEmitter, 'emitAdminNotification').mockImplementation(() => undefined);
    const body = { id: 'evt_x', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_x' } };

    const r = await request(app).post(`/webhooks/asaas/loja/${s.id}/autorizacao`).set('asaas-access-token', TOKEN).send(body);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 'REFUSED', refuseReason: 'WRONG_ENDPOINT' });
    expect(alert).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(alert.mock.calls[0][0])).toContain('Mecanismos de segurança');

    // Sem token válido: só INVALID_TOKEN, sem alerta (ninguém de fora dispara alertas).
    alert.mockClear();
    const anon = await request(app).post(`/webhooks/asaas/loja/${s.id}/autorizacao`).send(body);
    expect(anon.body.refuseReason).toBe('INVALID_TOKEN');
    expect(alert).not.toHaveBeenCalled();
  });

  it('com ASAAS_API_URL de produção, não loga o corpo', async () => {
    (env as any).ASAAS_API_URL = 'https://api.asaas.com/v3';
    const spy = jest.spyOn(logger as any, 'info');
    await request(app).post('/webhooks/asaas/loja/loja-inexistente/autorizacao').send(BODY);
    expect(sandboxCalls(spy).length).toBe(0);
  });
});
