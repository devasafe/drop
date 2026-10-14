/**
 * V16 · limite geral da API (100/min) conta por USUÁRIO nas rotas autenticadas (id do JWT com
 * assinatura verificada) e por IP quando não há usuário válido. Antes era só por IP: várias abas
 * ou aparelhos da loja na mesma rede dividiam o mesmo balde e tomavam 429.
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import env from '../config/env';
import { createApiLimiter } from '../middleware/apiLimiter';

const MAX = 5;
const buildApp = (max = MAX) => {
  const app = express();
  app.set('trust proxy', 1); // igual ao app.ts: o IP vem do X-Forwarded-For do 1º proxy
  app.use(cookieParser());
  app.use('/api', createApiLimiter({ max }));
  app.get('/api/ping', (_req, res) => res.json({ ok: true }));
  return app;
};

const tokenFor = (id: string, secret = env.JWT_SECRET as string) =>
  jwt.sign({ id, role: 'lojista', activeRole: 'lojista', roles: ['lojista'] }, secret);

const hit = (app: express.Express, ip: string, auth?: { bearer?: string; cookie?: string }) => {
  let r = request(app).get('/api/ping').set('X-Forwarded-For', ip);
  if (auth?.bearer) r = r.set('Authorization', `Bearer ${auth.bearer}`);
  if (auth?.cookie) r = r.set('Cookie', `token=${auth.cookie}`);
  return r;
};

const spend = async (n: number, fn: () => request.Test) => {
  const codes: number[] = [];
  for (let i = 0; i < n; i++) codes.push((await fn()).status);
  return codes;
};

describe('apiLimiter por usuário (V16)', () => {
  it('dois usuários no mesmo IP não dividem a cota', async () => {
    const app = buildApp();
    const a = tokenFor('user-a');
    const b = tokenFor('user-b');
    const codesA = await spend(MAX, () => hit(app, '10.0.0.1', { bearer: a }));
    expect(codesA.every((c) => c === 200)).toBe(true);
    expect((await hit(app, '10.0.0.1', { bearer: a })).status).toBe(429);
    // B (cookie httpOnly) no mesmo IP ainda tem a cota inteira
    const codesB = await spend(MAX, () => hit(app, '10.0.0.1', { cookie: b }));
    expect(codesB.every((c) => c === 200)).toBe(true);
    // e o anônimo do mesmo IP também
    expect((await hit(app, '10.0.0.1')).status).toBe(200);
  });

  it('um usuário não escapa do limite trocando de IP', async () => {
    const app = buildApp();
    const a = tokenFor('user-a');
    for (let i = 0; i < MAX; i++) {
      expect((await hit(app, `10.0.1.${i + 1}`, { bearer: a })).status).toBe(200);
    }
    expect((await hit(app, '10.0.1.200', { bearer: a })).status).toBe(429);
    expect((await hit(app, '10.0.1.201', { cookie: a })).status).toBe(429);
  });

  it('token com assinatura inválida conta por IP (não cria balde por id forjado)', async () => {
    const app = buildApp();
    const forjadoX = tokenFor('user-x', 'outro_segredo_qualquer_com_mais_de_32_caracteres');
    const forjadoY = tokenFor('user-y', 'outro_segredo_qualquer_com_mais_de_32_caracteres');
    // gasta a cota do IP alternando ids forjados: se o id não verificado valesse, cada um teria a sua
    const codes = await spend(MAX, () => hit(app, '10.0.2.1', { bearer: Math.random() < 0.5 ? forjadoX : forjadoY }));
    expect(codes.every((c) => c === 200)).toBe(true);
    expect((await hit(app, '10.0.2.1', { bearer: forjadoY })).status).toBe(429);
    expect((await hit(app, '10.0.2.1', { cookie: 'lixo.nao.jwt' })).status).toBe(429);
    expect((await hit(app, '10.0.2.1')).status).toBe(429);
    // um usuário válido nesse mesmo IP não é afetado
    expect((await hit(app, '10.0.2.1', { bearer: tokenFor('user-z') })).status).toBe(200);
    // e outro IP sem usuário tem a sua cota
    expect((await hit(app, '10.0.2.2', { bearer: forjadoX })).status).toBe(200);
  });

  it('o limite padrão segue 100/min por chave', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use('/api', createApiLimiter());
    app.get('/api/ping', (_req, res) => res.json({ ok: true }));
    const res = await request(app).get('/api/ping').set('X-Forwarded-For', '10.0.3.1');
    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-limit']).toBe('100');
  });
});
