/**
 * H4 — PATCH /user/me gravava qualquer sequência de dígitos como CPF (sem dígito
 * verificador). Depois o checkout falhava no Asaas. Agora CPF não vazio precisa ser válido.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@hotfixh4.test';
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

/** CPF aleatório com dígitos verificadores corretos (evita colidir com outra conta). */
function cpfValido(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (base.every((d) => d === base[0])) base[0] = (base[0] + 1) % 10;
  const dv = (nums: number[]) => {
    const peso = nums.length + 1;
    const s = nums.reduce((acc, d, i) => acc + d * (peso - i), 0);
    const c = 11 - (s % 11);
    return c >= 10 ? 0 : c;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  return [...base, d1, d2].join('');
}

describe('H4 — PATCH /user/me só aceita CPF válido', () => {
  it('CPF inválido → 400 "CPF inválido" e nada é gravado', async () => {
    const u = await createTestUser('cliente', DOMAIN, { verified: false });
    const res = await request(app).patch('/api/user/me').set('Authorization', bearer(u))
      .send({ name: 'Nome Novo', cpf: '123.456.789-00' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CPF inválido');
    const db = await prisma.user.findUnique({ where: { id: u.userId } });
    expect(db?.cpf ?? null).toBeNull();
    expect(db?.name).not.toBe('Nome Novo');
  });

  it('CPF com dígitos repetidos → 400', async () => {
    const u = await createTestUser('cliente', DOMAIN, { verified: false });
    const res = await request(app).patch('/api/user/me').set('Authorization', bearer(u)).send({ cpf: '11111111111' });
    expect(res.status).toBe(400);
  });

  it('CPF válido → 200 e grava só os dígitos', async () => {
    const u = await createTestUser('cliente', DOMAIN, { verified: false });
    const cpf = cpfValido();
    const masked = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
    const res = await request(app).patch('/api/user/me').set('Authorization', bearer(u)).send({ cpf: masked });
    expect(res.status).toBe(200);
    const db = await prisma.user.findUnique({ where: { id: u.userId } });
    expect(db?.cpf).toBe(cpf);
  });

  it('CPF vazio continua aceito (limpar o campo)', async () => {
    const u = await createTestUser('cliente', DOMAIN, { verified: false });
    const res = await request(app).patch('/api/user/me').set('Authorization', bearer(u)).send({ name: 'Sem CPF', cpf: '' });
    expect(res.status).toBe(200);
  });
});
