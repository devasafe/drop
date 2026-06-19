import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import env from '../config/env';
import WebhookEvent from '../models/WebhookEvent';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  env.ASAAS_WEBHOOK_TOKEN = undefined; // garante estado limpo entre testes
});

const sampleEvent = (id = 'evt_test_1') => ({
  id,
  event: 'PAYMENT_RECEIVED',
  payment: { id: 'pay_123', status: 'RECEIVED', value: 100 },
});

describe('POST /webhooks/asaas (Fase 0)', () => {
  it('persiste o evento e responde 200', async () => {
    const res = await request(app).post('/webhooks/asaas').send(sampleEvent());

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const count = await WebhookEvent.countDocuments({ eventId: 'evt_test_1' });
    expect(count).toBe(1);
  });

  it('é idempotente: evento duplicado não é reprocessado', async () => {
    await request(app).post('/webhooks/asaas').send(sampleEvent());
    const res2 = await request(app).post('/webhooks/asaas').send(sampleEvent());

    expect(res2.status).toBe(200);
    expect(res2.body.duplicate).toBe(true);

    const count = await WebhookEvent.countDocuments({ eventId: 'evt_test_1' });
    expect(count).toBe(1); // não duplicou
  });

  it('rejeita payload inválido (sem event/id)', async () => {
    const res = await request(app).post('/webhooks/asaas').send({ foo: 'bar' });
    expect(res.status).toBe(400);
  });

  it('valida o token quando ASAAS_WEBHOOK_TOKEN está configurado', async () => {
    env.ASAAS_WEBHOOK_TOKEN = 'segredo-webhook';

    const semToken = await request(app).post('/webhooks/asaas').send(sampleEvent('evt_tok_1'));
    expect(semToken.status).toBe(401);

    const tokenErrado = await request(app)
      .post('/webhooks/asaas')
      .set('asaas-access-token', 'errado')
      .send(sampleEvent('evt_tok_2'));
    expect(tokenErrado.status).toBe(401);

    const tokenCerto = await request(app)
      .post('/webhooks/asaas')
      .set('asaas-access-token', 'segredo-webhook')
      .send(sampleEvent('evt_tok_3'));
    expect(tokenCerto.status).toBe(200);
  });

  it('deriva eventId quando o corpo não traz id', async () => {
    const res = await request(app)
      .post('/webhooks/asaas')
      .send({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_999', status: 'RECEIVED' } });

    expect(res.status).toBe(200);
    const ev = await WebhookEvent.findOne({ eventId: 'PAYMENT_RECEIVED:pay_999:RECEIVED' });
    expect(ev).not.toBeNull();
  });
});
