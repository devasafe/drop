// src/tests/opreal.pixPrazo.test.ts
/**
 * Bug de 26/10: a tela do Pix mostrava o `expirationDate` do Asaas (fim do dia, texto sem fuso)
 * em vez do prazo real do pedido (criação + PIX_EXPIRATION_MINUTES, quando o job o cancela).
 * Agora o servidor manda o prazo real em ISO e a própria hora (serverNow).
 */
jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return {
    __esModule: true,
    ...actual,
    default: {
      ...actual.default,
      get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(),
      getAs: jest.fn(), postAs: jest.fn(), putAs: jest.fn(), deleteAs: jest.fn(),
    },
  };
});

import request from 'supertest';
import app from '../app';
import env from '../config/env';
import asaasClient from '../services/asaas/client';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { pixDeadline, withPixDeadline } from '../utils/pixDeadline';

const DOMAIN = '@pixprazo.test';
const getAs = asaasClient.getAs as jest.Mock;
const ASAAS_QR = { encodedImage: 'img', payload: 'pix-copia', expirationDate: '2026-10-26 23:59:59' };

beforeEach(() => {
  jest.clearAllMocks();
  getAs.mockImplementation(async (_k: string, path: string) => (path.endsWith('/pixQrCode') ? ASAAS_QR : { status: 'PENDING' }));
});
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });
afterAll(async () => { await prisma.$disconnect(); });

it('pixDeadline: criação + PIX_EXPIRATION_MINUTES, em ISO', () => {
  const created = new Date('2026-10-26T18:00:00.000Z');
  const minutes = env.PIX_EXPIRATION_MINUTES || 30;
  expect(pixDeadline(created)).toBe(new Date(created.getTime() + minutes * 60000).toISOString());
});

it('withPixDeadline troca o prazo do Asaas pelo do pedido e põe a hora do servidor', () => {
  const created = new Date('2026-10-26T18:00:00.000Z');
  const out = withPixDeadline({ qrCodePayload: 'x', expiresAt: '2026-10-26 23:59:59' }, created);
  expect(out.expiresAt).toBe(pixDeadline(created));
  expect(Number.isFinite(Date.parse(out.serverNow))).toBe(true);
  expect(out.qrCodePayload).toBe('x');
});

it('GET /orders/:id/pix (modo SaaS): prazo do pedido, não o do Asaas', async () => {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja Pix', isOpen: true } as any });
  await prisma.storeAsaasAccount.create({
    data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData('$aact_hmlg_PIXPRAZO'), apiKeyLast4: 'PRAZ', environment: 'sandbox', status: 'valid' },
  });
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, totalValue: 50, deliveryFee: 5, paymentMethod: 'pix', paymentStatus: 'pending',
      status: 'criado', paymentProvider: 'asaas_loja', asaasPaymentId: 'pay_prazo_1',
    } as any,
  });
  const r = await request(app).get(`/api/orders/${order.id}/pix`).set('Authorization', bearer(cliente));
  expect(r.status).toBe(200);
  expect(r.body.paid).toBe(false);
  expect(r.body.expiresAt).toBe(pixDeadline(order.createdAt));
  expect(Number.isFinite(Date.parse(r.body.serverNow))).toBe(true);
});
