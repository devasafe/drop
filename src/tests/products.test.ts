import request from 'supertest';
import app from '../../src/app';
import { connectDB, disconnectDB } from '../../src/db';
import Store from '../../src/models/Store';
import Product from '../../src/models/Product';

describe('Products', () => {
  let lojistaToken: string;
  let storeId: string;

  beforeAll(async () => {
    await connectDB();

    // create lojista
    await request(app).post('/auth/register').send({ name: 'Lojista', email: 'loj@ex.com', password: 'pass', role: 'lojista' });
    const login = await request(app).post('/auth/login').send({ email: 'loj@ex.com', password: 'pass' });
    lojistaToken = login.body.token;

    // create store directly
    const userRes = login.body.user;
    const store = await Store.create({ ownerId: userRes.id, name: 'Loja Test' });
    storeId = store._id.toString();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('should create a product (lojista)', async () => {
    const res = await request(app).post('/products').set('Authorization', `Bearer ${lojistaToken}`).send({ storeId, name: 'P1', price: 10, quantity: 5 });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('_id');
  });
});
