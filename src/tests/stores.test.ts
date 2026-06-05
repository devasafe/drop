import request from 'supertest';
import app from '../../src/app';
import { connectDB, disconnectDB } from '../../src/db';

describe('Stores', () => {
  beforeAll(async () => {
    await connectDB();
  });
  afterAll(async () => {
    await disconnectDB();
  });

  it('should allow a lojista to create one store and prevent a second', async () => {
    const user = { name: 'ShopOwner', email: 'owner@example.com', password: 'pass123', role: 'lojista' };
    const reg = await request(app).post('/auth/register').send(user);
    expect(reg.status).toBe(201);

    const login = await request(app).post('/auth/login').send({ email: user.email, password: user.password });
    expect(login.status).toBe(200);
    const token = login.body.token;

    const res1 = await request(app).post('/stores').set('Authorization', `Bearer ${token}`).send({ name: 'Loja X', address: 'Rua A' });
    expect(res1.status).toBe(201);
    expect(res1.body).toHaveProperty('_id');

    const res2 = await request(app).post('/stores').set('Authorization', `Bearer ${token}`).send({ name: 'Loja Y', address: 'Rua B' });
    expect([400, 409]).toContain(res2.status);
  });
});
