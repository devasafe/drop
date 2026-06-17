import request from 'supertest';
import app from '../../src/app';
import { connectDB, disconnectDB } from '../../src/db';
import Store from '../../src/models/Store';
import Product from '../../src/models/Product';

describe('Delivery claim flow', () => {
  let lojistaToken: string;
  let storeId: string;
  let productId: string;
  let customerToken: string;

  beforeAll(async () => {
    await connectDB();

    // create lojista and store
    await request(app).post('/auth/register').send({ name: 'Lojista', email: 'loj.claim@example.com', password: 'pass', role: 'lojista' });
    const login = await request(app).post('/auth/login').send({ email: 'loj.claim@example.com', password: 'pass' });
    lojistaToken = login.body.token;
    const userRes = login.body.user;
    const store = await Store.create({ ownerId: userRes.id, name: 'Loja Claim' });
    storeId = store._id.toString();

    // create product
    const prodRes = await request(app).post('/products').set('Authorization', `Bearer ${lojistaToken}`).send({ storeId, name: 'P-Claim', price: 10, quantity: 5 });
    productId = prodRes.body._id;

    // create customer
    await request(app).post('/auth/register').send({ name: 'Cust', email: 'cust.claim@example.com', password: 'pass', role: 'cliente' });
    const custLogin = await request(app).post('/auth/login').send({ email: 'cust.claim@example.com', password: 'pass' });
    customerToken = custLogin.body.token;
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('should allow first motoboy to claim and prevent second from claiming', async () => {
    // create order as customer
    const orderRes = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ storeId, products: [{ productId, quantity: 1 }], deliveryDistanceKm: 3, paymentMethod: 'card' });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body._id;

    // store accepts order -> create delivery
    const acceptRes = await request(app)
      .put(`/orders/${orderId}/accept`)
      .set('Authorization', `Bearer ${lojistaToken}`)
      .send({ distance: 3 });
    expect(acceptRes.status).toBe(201);
    const deliveryId = acceptRes.body._id;

    // register two motoboys
    await request(app).post('/auth/register').send({ name: 'Moto1', email: 'm1@example.com', password: 'pass', role: 'motoboy' });
    const m1 = await request(app).post('/auth/login').send({ email: 'm1@example.com', password: 'pass' });
    const m1Token = m1.body.token;

    await request(app).post('/auth/register').send({ name: 'Moto2', email: 'm2@example.com', password: 'pass', role: 'motoboy' });
    const m2 = await request(app).post('/auth/login').send({ email: 'm2@example.com', password: 'pass' });
    const m2Token = m2.body.token;

    // first motoboy claims
    const claim1 = await request(app).post(`/deliveries/${deliveryId}/claim`).set('Authorization', `Bearer ${m1Token}`).send();
    expect(claim1.status).toBe(200);
    expect(claim1.body.motoboyId).toBeDefined();

    // second motoboy attempts to claim -> should fail
    const claim2 = await request(app).post(`/deliveries/${deliveryId}/claim`).set('Authorization', `Bearer ${m2Token}`).send();
    expect([409, 400]).toContain(claim2.status);
  });
});
