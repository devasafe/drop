/**
 * Regressão (riscos remanescentes 2026-10-07) — f02: dados do cliente em GET /deliveries/:id.
 * Loja e motoboy precisam do nome, do telefone e do endereço DESTE pedido para entregar.
 * Antes recebiam também o e-mail e a lista de TODOS os endereços salvos do cliente.
 * O motoboy só vê o telefone enquanto a entrega está em andamento.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@sf02.test';
const TELEFONE = '11988887777';
const BASE = { cep: '01000000', latitude: '-23.5', longitude: '-46.6', neighborhood: 'Centro', city: 'SP', state: 'SP' };
const CASA = { ...BASE, label: 'Casa', street: 'Rua Secreta', number: '1', isDefault: true };
const TRABALHO = { ...BASE, label: 'Trabalho', street: 'Av. Privada', number: '2' };

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function cenario(status: 'assigned' | 'picked' | 'delivered') {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  await prisma.user.update({ where: { id: cliente.userId }, data: { telefone: TELEFONE, addresses: { create: [CASA, TRABALHO] } } });
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja sf02', isOpen: true } });
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, totalValue: 30, deliveryFee: 9, status: 'pago',
      paymentMethod: 'pix', paymentStatus: 'paid', customerAddress: 'Rua do Pedido, 10',
    },
  });
  const delivery = await prisma.delivery.create({
    data: { orderId: order.id, status, motoboyId: motoboy.userId, fee: 9, distance: 4, pin: '12345', pinRetirada: '54321', customerAddress: 'Rua do Pedido, 10' },
  });
  const email = (await prisma.user.findUnique({ where: { id: cliente.userId }, select: { email: true } }))!.email;
  const emailDono = (await prisma.user.findUnique({ where: { id: dono.userId }, select: { email: true } }))!.email;
  return { dono, motoboy, delivery, email, emailDono };
}

const get = (id: string, u: any) => request(app).get(`/api/deliveries/${id}`).set('Authorization', bearer(u));

describe('f02 — dados do cliente na entrega', () => {
  it('motoboy em rota: nome, telefone e endereço do pedido; sem e-mail nem outros endereços', async () => {
    const { motoboy, delivery, email, emailDono } = await cenario('picked');
    const res = await get(delivery.id, motoboy);
    expect(res.status).toBe(200);
    expect(res.body.customerObj.name).toBeDefined();
    expect(res.body.customerObj.telefone).toBe(TELEFONE);
    expect(res.body.deliveryAddress).toBe('Rua do Pedido, 10');
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(email);
    expect(raw).not.toContain('Av. Privada');
    expect(raw).not.toContain('Rua Secreta');
    expect(raw).not.toContain(emailDono); // e-mail pessoal do lojista também não
  });

  it('loja: telefone sim; e-mail e endereços salvos não', async () => {
    const { dono, delivery, email } = await cenario('assigned');
    const res = await get(delivery.id, dono);
    expect(res.status).toBe(200);
    expect(res.body.customerObj.telefone).toBe(TELEFONE);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(email);
    expect(raw).not.toContain('Av. Privada');
  });

  it('motoboy depois da entrega concluída não vê mais o telefone', async () => {
    const { motoboy, delivery } = await cenario('delivered');
    const res = await get(delivery.id, motoboy);
    expect(res.status).toBe(200);
    expect(res.body.customerObj.telefone).toBeUndefined();
  });
});
