/**
 * Regressão (auditoria de segurança 2026-10-07) — item 6: webhook do Asaas fail-closed.
 * Sem ASAAS_WEBHOOK_TOKEN configurado o webhook recusa tudo (antes aceitava qualquer
 * chamada e permitia marcar pedido como pago sem pagamento). Comparação em tempo constante.
 */
import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';

const original = env.ASAAS_WEBHOOK_TOKEN;

afterEach(async () => {
  env.ASAAS_WEBHOOK_TOKEN = original;
  await prisma.webhookEvent.deleteMany({ where: { eventId: { startsWith: 'evt_sec06_' } } });
});

const event = (id: string) => ({
  id,
  event: 'PAYMENT_CONFIRMED',
  payment: { id: 'pay_sec06', status: 'CONFIRMED', value: 10 },
});

describe('Item 6 — webhook Asaas fail-closed', () => {
  it('sem token configurado recusa a chamada e não registra o evento', async () => {
    env.ASAAS_WEBHOOK_TOKEN = undefined;
    const res = await request(app).post('/webhooks/asaas').send(event('evt_sec06_1'));
    expect(res.status).toBe(503);
    expect(await prisma.webhookEvent.count({ where: { eventId: 'evt_sec06_1' } })).toBe(0);
  });

  it('sem token configurado recusa mesmo quem manda um header qualquer', async () => {
    env.ASAAS_WEBHOOK_TOKEN = '';
    const res = await request(app)
      .post('/webhooks/asaas')
      .set('asaas-access-token', '')
      .send(event('evt_sec06_2'));
    expect(res.status).toBe(503);
  });

  it('token errado do mesmo tamanho → 401; token certo → 200', async () => {
    env.ASAAS_WEBHOOK_TOKEN = 'segredo-sec06-xyz';
    const errado = await request(app)
      .post('/webhooks/asaas')
      .set('asaas-access-token', 'segredo-sec06-abc')
      .send(event('evt_sec06_3'));
    expect(errado.status).toBe(401);

    const certo = await request(app)
      .post('/webhooks/asaas')
      .set('asaas-access-token', 'segredo-sec06-xyz')
      .send(event('evt_sec06_4'));
    expect(certo.status).toBe(200);
  });
});
