/**
 * Fase C2 — Task 1. O 401 do login diz quantas tentativas faltam e o 429 diz a hora de volta.
 * O limiter real é pulado em teste; aqui ele roda numa app mínima com skipInTest:false.
 */
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../app';
import { prisma } from '../lib/prisma';
import { login } from '../controllers/authController';
import { createAuthLimiter } from '../middleware/authLimiter';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';

const DOMAIN = '@c2login.test';
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });
afterAll(async () => { await prisma.$disconnect(); });

function miniApp(max: number) {
  const a = express();
  a.use(express.json());
  a.post('/login', createAuthLimiter({ max, skipInTest: false }), login as any);
  return a;
}

async function criarCliente(): Promise<string> {
  const email = `a${Date.now()}${Math.random().toString(36).slice(2, 6)}${DOMAIN}`;
  await prisma.user.create({
    data: { name: 'Ana', email, passwordHash: await bcrypt.hash('Senha123!', 10), role: 'cliente', roles: ['cliente'], activeRole: 'cliente' } as any,
  });
  return email;
}

it('senha errada: 401 diz quantas tentativas faltam na janela', async () => {
  const email = await criarCliente();
  const a = miniApp(3);
  const r1 = await request(a).post('/login').send({ email, password: 'errada' });
  expect(r1.status).toBe(401);
  expect(r1.body).toEqual({ error: 'Invalid credentials', attemptsLeft: 2 });
  const r2 = await request(a).post('/login').send({ email, password: 'errada' });
  expect(r2.body.attemptsLeft).toBe(1);
});

it('e-mail que não existe também conta (a resposta não revela se a conta existe)', async () => {
  const r = await request(miniApp(5)).post('/login').send({ email: `ninguem${DOMAIN}`, password: 'x' });
  expect(r.status).toBe(401);
  expect(r.body).toEqual({ error: 'Invalid credentials', attemptsLeft: 4 });
});

it('estourou o limite: 429 em JSON com a hora de volta', async () => {
  const a = miniApp(1);
  await request(a).post('/login').send({ email: `x${DOMAIN}`, password: 'x' });
  const r = await request(a).post('/login').send({ email: `x${DOMAIN}`, password: 'x' });
  expect(r.status).toBe(429);
  expect(r.body.error).toMatch(/^Muitas tentativas\. Tente de novo às \d{2}:\d{2}\.$/);
  expect(Number.isNaN(Date.parse(r.body.retryAt))).toBe(false);
});

it('rota real em teste (limiter pulado): contrato antigo, sem attemptsLeft', async () => {
  const r = await request(app).post('/api/auth/login').send({ email: `nao${DOMAIN}`, password: 'x' });
  expect(r.status).toBe(401);
  expect(r.body).toEqual({ error: 'Invalid credentials' });
});
