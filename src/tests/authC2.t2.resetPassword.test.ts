/**
 * Fase C2 — Task 2. "Salvar e entrar": a troca abre a sessão; o código trava no 5º erro;
 * conta bloqueada troca a senha mas não entra.
 */
import request from 'supertest';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';

const DOMAIN = '@c2reset.test';
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });
afterAll(async () => { await prisma.$disconnect(); });

async function cenario(opts: { status?: 'blocked'; expired?: boolean } = {}) {
  const email = `r${Date.now()}${Math.random().toString(36).slice(2, 6)}${DOMAIN}`;
  const user = await prisma.user.create({
    data: { name: 'Ana', email, passwordHash: await bcrypt.hash('Antiga123', 10), role: 'cliente', roles: ['cliente'], activeRole: 'cliente', ...(opts.status ? { status: opts.status } : {}) } as any,
  });
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: sha256('482190'), expiresAt: new Date(Date.now() + (opts.expired ? -1 : 15) * 60 * 1000) },
  });
  return { email, userId: user.id };
}
const reset = (body: Record<string, string>) => request(app).post('/api/auth/reset-password').send(body);
const entrar = (email: string, password: string) => request(app).post('/api/auth/login').send({ email, password });

it('código certo: troca a senha e já abre a sessão (mesmo corpo do login + cookie)', async () => {
  const { email, userId } = await cenario();
  const r = await reset({ email, code: '482190', newPassword: 'NovaSenha1' });
  expect(r.status).toBe(200);
  expect(r.body.user).toMatchObject({ email, activeRole: 'cliente', roles: ['cliente'] });
  expect(typeof r.body.token).toBe('string');
  expect(String(r.headers['set-cookie'])).toMatch(/token=/);
  expect((await entrar(email, 'NovaSenha1')).status).toBe(200);
  expect(await prisma.passwordResetToken.count({ where: { userId } })).toBe(0);
});

it('código errado: 400 com as tentativas que faltam', async () => {
  const { email } = await cenario();
  const r = await reset({ email, code: '000000', newPassword: 'NovaSenha1' });
  expect(r.status).toBe(400);
  expect(r.body).toEqual({ error: 'Código incorreto', attemptsLeft: 4 });
});

it('no 5º erro o código trava, mesmo que o próximo esteja certo; a senha antiga continua', async () => {
  const { email } = await cenario();
  for (let i = 0; i < 4; i++) await reset({ email, code: '000000', newPassword: 'NovaSenha1' });
  const quinto = await reset({ email, code: '000000', newPassword: 'NovaSenha1' });
  expect(quinto.body).toEqual({ error: 'Muitas tentativas. Peça outro código.', code: 'RESET_CODE_LOCKED', attemptsLeft: 0 });
  const certo = await reset({ email, code: '482190', newPassword: 'NovaSenha1' });
  expect(certo.status).toBe(400);
  expect(certo.body.code).toBe('RESET_CODE_LOCKED');
  expect((await entrar(email, 'Antiga123')).status).toBe(200);
});

it('conta bloqueada: troca a senha e não abre sessão', async () => {
  const { email } = await cenario({ status: 'blocked' });
  const r = await reset({ email, code: '482190', newPassword: 'NovaSenha1' });
  expect(r.status).toBe(200);
  expect(r.body.blocked).toBe(true);
  expect(r.body.user).toBeUndefined();
  expect(String(r.headers['set-cookie'] ?? '')).not.toMatch(/token=/);
});

it('código expirado: 400 sem sessão', async () => {
  const { email } = await cenario({ expired: true });
  const r = await reset({ email, code: '482190', newPassword: 'NovaSenha1' });
  expect(r.status).toBe(400);
  expect(r.body).toEqual({ error: 'Código inválido ou expirado' });
});
