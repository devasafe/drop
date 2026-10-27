import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createWallet } from './helpers/financePg';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';
const DOMAIN = '@acd.test';
const SENHA = 'Senha123!';

// A conta excluída troca o e-mail; guardamos os ids para devolver o domínio da suíte e o cleanup recolher.
const created: string[] = [];

afterEach(async () => {
  for (const id of created.splice(0)) {
    await prisma.user.updateMany({ where: { id }, data: { email: `restored-${id}${DOMAIN}` } });
  }
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function conta(role: 'cliente' | 'lojista' | 'motoboy' = 'cliente') {
  const roles = role === 'cliente' ? ['cliente'] : [role, 'cliente'];
  const user = await prisma.user.create({
    data: {
      name: 'Pessoa Teste',
      email: `u-${Date.now()}-${Math.random().toString(36).slice(2)}${DOMAIN}`,
      passwordHash: await bcrypt.hash(SENHA, 10),
      role, roles: roles as any, activeRole: role,
      telefone: '11999990000', cpf: '39053344705', photo: 'https://x/foto.png',
      currentLocation: { lat: -23.5, lng: -46.6 }, isOnline: true,
    },
  });
  created.push(user.id);
  const token = jwt.sign({ id: user.id, role, activeRole: role, roles }, JWT_SECRET);
  return { user, token };
}

describe('Exclusão de conta pelo próprio usuário', () => {
  it('sem pendências: anonimiza, apaga endereços e a sessão deixa de valer', async () => {
    const { user, token } = await conta();
    await prisma.address.create({ data: { userId: user.id, street: 'R. Aurora', number: '112', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', cep: '01209001', latitude: '-23.54', longitude: '-46.64' } });

    const check = await request(app).get('/api/account/deletion-check').set('Authorization', `Bearer ${token}`);
    expect(check.status).toBe(200);
    expect(check.body.blockers).toEqual([]);

    const res = await request(app).post('/api/account/delete').set('Authorization', `Bearer ${token}`).send({ password: SENHA });
    expect(res.status).toBe(200);

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after!.status).toBe('deleted');
    expect(after!.deletedAt).not.toBeNull();
    expect(after!.name).toBe('Conta excluída');
    expect(after!.email).toBe(`${user.id}@excluida.dropapp.com.br`);
    expect(after!.cpf).toBeNull();
    expect(after!.telefone).toBeNull();
    expect(after!.photo).toBeNull();
    expect(after!.isOnline).toBe(false);
    expect(await bcrypt.compare(SENHA, after!.passwordHash)).toBe(false);
    expect(await prisma.address.count({ where: { userId: user.id } })).toBe(0);

    const again = await request(app).get('/api/account/deletion-check').set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(401);
  });

  it('senha errada não exclui', async () => {
    const { user, token } = await conta();
    const res = await request(app).post('/api/account/delete').set('Authorization', `Bearer ${token}`).send({ password: 'errada' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('WRONG_PASSWORD');
    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.status).toBe('active');
  });

  it('taxa pendente e saldo na carteira bloqueiam', async () => {
    const { user, token } = await conta();
    await prisma.customerDebt.create({ data: { customerId: user.id, amount: 9.9, sourceOrderId: 'pedido-acd', reason: 'Cancelamento tardio' } });
    await createWallet({ owner: user.id, ownerType: 'user', balance: 5 });

    const check = await request(app).get('/api/account/deletion-check').set('Authorization', `Bearer ${token}`);
    expect(check.body.blockers.map((b: any) => b.code)).toEqual(expect.arrayContaining(['PENDING_DEBT', 'WALLET_BALANCE']));

    const res = await request(app).post('/api/account/delete').set('Authorization', `Bearer ${token}`).send({ password: SENHA });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('DELETION_BLOCKED');
    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.status).toBe('active');
  });

  it('motoboy com entrega em andamento não exclui', async () => {
    const { user, token } = await conta('motoboy');
    await prisma.delivery.create({ data: { orderId: `ord-acd-${Date.now()}`, motoboyId: user.id, status: 'picked', fee: 8 } as any });
    const check = await request(app).get('/api/account/deletion-check').set('Authorization', `Bearer ${token}`);
    expect(check.body.blockers.map((b: any) => b.code)).toContain('OPEN_RIDE');
  });

  it('lojista: a loja sai da vitrine e fica pausada', async () => {
    const { user, token } = await conta('lojista');
    const store = await prisma.store.create({ data: { ownerId: user.id, name: 'Loja ACD', isOpen: true, cnpj: '11222333000181' } });

    const res = await request(app).post('/api/account/delete').set('Authorization', `Bearer ${token}`).send({ password: SENHA });
    expect(res.status).toBe(200);

    const s = await prisma.store.findUnique({ where: { id: store.id } });
    expect(s!.isOpen).toBe(false);
    expect(s!.showInMarketplace).toBe(false);
    expect(s!.adminPausedAt).not.toBeNull();
    expect(s!.cnpj).toBe('11222333000181');
  });
});
