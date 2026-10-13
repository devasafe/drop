/**
 * V14 — o CEP com máscara não pode zerar a verificação de endereço da loja.
 * O PUT compara e grava o CEP só em dígitos; mudança real de CEP continua zerando.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@v14zip.test';
const ADDR = { street: 'Av Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' };

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function lojaVerificada(zip: string) {
  const dono = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({ data: {
    ownerId: dono.userId, name: 'Loja Zip', isOpen: true, isVerified: true, ...ADDR, zip,
    verification: { cnpj: { status: 'approved' }, address: { status: 'approved' } },
  } });
  return { dono, store };
}

describe('PUT /stores/:id — CEP normalizado', () => {
  it('salvo em dígitos, enviado com máscara: verificação intacta', async () => {
    const { dono, store } = await lojaVerificada('01310100');
    const res = await request(app).put(`/api/stores/${store.id}`).set('Authorization', bearer(dono)).send({ ...ADDR, zip: '01310-100' });
    expect(res.status).toBe(200);
    const saved = await prisma.store.findUnique({ where: { id: store.id } });
    expect((saved!.verification as any).address.status).toBe('approved');
    expect(saved!.isVerified).toBe(true);
    expect(saved!.zip).toBe('01310100');
  });

  it('salvo com máscara (legado), enviado em dígitos: intacta e passa a guardar dígitos', async () => {
    const { dono, store } = await lojaVerificada('01310-100');
    const res = await request(app).put(`/api/stores/${store.id}`).set('Authorization', bearer(dono)).send({ ...ADDR, zip: '01310100' });
    expect(res.status).toBe(200);
    const saved = await prisma.store.findUnique({ where: { id: store.id } });
    expect((saved!.verification as any).address.status).toBe('approved');
    expect(saved!.isVerified).toBe(true);
    expect(saved!.zip).toBe('01310100');
  });

  it('CEP realmente diferente: zera a verificação e guarda dígitos', async () => {
    const { dono, store } = await lojaVerificada('01310100');
    const res = await request(app).put(`/api/stores/${store.id}`).set('Authorization', bearer(dono)).send({ ...ADDR, zip: '01001-000' });
    expect(res.status).toBe(200);
    const saved = await prisma.store.findUnique({ where: { id: store.id } });
    expect((saved!.verification as any).address.status).toBe('none');
    expect(saved!.isVerified).toBe(false);
    expect(saved!.zip).toBe('01001000');
  });

  it.each([[''], [null], ['---']])('zip %p no corpo = não enviado: verificação e CEP salvo intactos', async (vazio) => {
    const { dono, store } = await lojaVerificada('01310100');
    const res = await request(app).put(`/api/stores/${store.id}`).set('Authorization', bearer(dono)).send({ ...ADDR, zip: vazio });
    expect(res.status).toBe(200);
    const saved = await prisma.store.findUnique({ where: { id: store.id } });
    expect((saved!.verification as any).address.status).toBe('approved');
    expect(saved!.isVerified).toBe(true);
    expect(saved!.zip).toBe('01310100');
  });
});
