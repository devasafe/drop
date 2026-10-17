/**
 * Papel de equipe vira acréscimo (16/10): quem tem `marketing`/`gerente_*` continua cliente
 * e o painel usa a UNIÃO das permissões do papel ativo com as dos papéis de equipe da conta.
 *  - a permissão vem dos papéis gravados no banco (remover o papel vale na hora, mesmo com o token antigo);
 *  - `wallet:credit` nunca entra, nem gravada na linha do papel de equipe;
 *  - não se troca mais para papel de equipe (400 TEAM_ROLE_NOT_SWITCHABLE);
 *  - conta presa com papel ativo de equipe volta como cliente no login.
 */
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { TEST_JWT_SECRET } from './helpers/authUser';

const DOMAIN = '@equipe-acrescimo.test';
const PASSWORD = 'Senha123!';

let previousMarketing: any = null;

beforeAll(async () => {
  previousMarketing = await prisma.rolePermissions.findUnique({ where: { role: 'marketing' } });
  const data = {
    permissions: ['broadcast:send', 'banner:manage', 'wallet:credit'],
    notificationTargets: ['marketing'] as any,
    updatedBy: 'test-equipe-acrescimo',
  };
  await prisma.rolePermissions.upsert({ where: { role: 'marketing' }, create: { role: 'marketing', ...data }, update: data });
});

afterAll(async () => {
  if (previousMarketing) {
    const { permissions, notificationTargets, updatedBy } = previousMarketing;
    await prisma.rolePermissions.update({ where: { role: 'marketing' }, data: { permissions, notificationTargets, updatedBy } });
  } else {
    await prisma.rolePermissions.deleteMany({ where: { role: 'marketing' } });
  }
  await prisma.$disconnect();
});

afterEach(async () => {
  const sent = await prisma.broadcast.findMany({ where: { title: { startsWith: '[equipe-acrescimo]' } }, select: { id: true } });
  const ids = sent.map((b) => b.id);
  await prisma.notification.deleteMany({ where: { broadcastId: { in: ids } } });
  await prisma.broadcast.deleteMany({ where: { id: { in: ids } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function createAccount(roles: string[], activeRole: string, role = 'cliente') {
  const email = `u-${Date.now()}-${Math.random().toString(36).slice(2)}${DOMAIN}`;
  const user = await prisma.user.create({
    data: {
      name: 'Equipe',
      email,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: role as any,
      roles: roles as any,
      activeRole: activeRole as any,
    },
  });
  const token = jwt.sign({ id: user.id, role: activeRole, activeRole, roles }, TEST_JWT_SECRET, { expiresIn: '1h' });
  return { user, email, token };
}

const sendBroadcast = (token: string) =>
  request(app)
    .post('/api/broadcasts')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: '[equipe-acrescimo] aviso', body: 'teste', targetRoles: ['marketing'] });

describe('papel de equipe como acréscimo — permissões', () => {
  it('cliente+marketing com papel ativo cliente envia broadcast; cliente puro não', async () => {
    const equipe = await createAccount(['cliente', 'marketing'], 'cliente');
    const puro = await createAccount(['cliente'], 'cliente');

    const ok = await sendBroadcast(equipe.token);
    expect(ok.status).toBeLessThan(300);

    const negado = await sendBroadcast(puro.token);
    expect(negado.status).toBe(403);
  });

  it('GET /role-permissions/me devolve a união e os papéis de equipe, sem wallet:credit', async () => {
    const equipe = await createAccount(['cliente', 'marketing'], 'cliente');

    const res = await request(app).get('/api/role-permissions/me').set('Authorization', `Bearer ${equipe.token}`);

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('cliente');
    expect(res.body.teamRoles).toEqual(['marketing']);
    expect(res.body.permissions).toEqual(expect.arrayContaining(['broadcast:send', 'banner:manage', 'order:create']));
    expect(res.body.permissions).not.toContain('wallet:credit');
  });

  it('cliente puro recebe teamRoles vazio', async () => {
    const puro = await createAccount(['cliente'], 'cliente');
    const res = await request(app).get('/api/role-permissions/me').set('Authorization', `Bearer ${puro.token}`);
    expect(res.status).toBe(200);
    expect(res.body.teamRoles).toEqual([]);
    expect(res.body.permissions).not.toContain('broadcast:send');
  });

  it('remover marketing de roles derruba a permissão na requisição seguinte, mesmo com o token antigo', async () => {
    const equipe = await createAccount(['cliente', 'marketing'], 'cliente');
    expect((await sendBroadcast(equipe.token)).status).toBeLessThan(300);

    await prisma.user.update({ where: { id: equipe.user.id }, data: { roles: ['cliente'] as any } });

    expect((await sendBroadcast(equipe.token)).status).toBe(403);
    const me = await request(app).get('/api/role-permissions/me').set('Authorization', `Bearer ${equipe.token}`);
    expect(me.body.teamRoles).toEqual([]);
    expect(me.body.permissions).not.toContain('broadcast:send');
  });
});

describe('papel de equipe como acréscimo — troca de área', () => {
  it('switchRole para marketing dá 400 TEAM_ROLE_NOT_SWITCHABLE e não grava', async () => {
    const equipe = await createAccount(['cliente', 'marketing'], 'cliente');

    const res = await request(app)
      .post('/api/auth/switch-role')
      .set('Authorization', `Bearer ${equipe.token}`)
      .send({ newRole: 'marketing' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TEAM_ROLE_NOT_SWITCHABLE');
    const saved = await prisma.user.findUnique({ where: { id: equipe.user.id } });
    expect(saved!.activeRole).toBe('cliente');
  });

  it('PUT /user/active-role também recusa papel de equipe', async () => {
    const equipe = await createAccount(['cliente', 'marketing'], 'cliente');

    const res = await request(app)
      .put('/api/user/active-role')
      .set('Authorization', `Bearer ${equipe.token}`)
      .send({ activeRole: 'marketing' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TEAM_ROLE_NOT_SWITCHABLE');
    const saved = await prisma.user.findUnique({ where: { id: equipe.user.id } });
    expect(saved!.activeRole).toBe('cliente');
  });

  it('login de conta presa com papel ativo marketing volta como cliente e grava no banco', async () => {
    const presa = await createAccount(['cliente', 'marketing'], 'marketing', 'marketing');

    const res = await request(app).post('/api/auth/login').send({ email: presa.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.activeRole).toBe('cliente');
    const decoded = jwt.verify(res.body.token, TEST_JWT_SECRET) as any;
    expect(decoded.activeRole).toBe('cliente');
    const saved = await prisma.user.findUnique({ where: { id: presa.user.id } });
    expect(saved!.activeRole).toBe('cliente');
  });
});

describe('papel de equipe como acréscimo — pontos que decidiam pelo papel ativo', () => {
  afterEach(async () => {
    await prisma.supportTicket.deleteMany({ where: { subject: { startsWith: '[equipe-acrescimo]' } } });
  });

  it('cliente+gerente_clientes com papel ativo cliente vê os tickets da categoria clientes (só eles)', async () => {
    const gerente = await createAccount(['cliente', 'gerente_clientes'], 'cliente');
    const openedBy = { userId: 'outra-pessoa', role: 'cliente', name: 'X' };
    await prisma.supportTicket.createMany({
      data: [
        { conversationId: 'conv-eq-1', openedBy, category: 'clientes', subject: '[equipe-acrescimo] clientes' },
        { conversationId: 'conv-eq-2', openedBy, category: 'lojistas', subject: '[equipe-acrescimo] lojistas' },
      ],
    });

    const res = await request(app).get('/api/support/tickets?scope=staff').set('Authorization', `Bearer ${gerente.token}`);

    expect(res.status).toBe(200);
    const mine = res.body.filter((t: any) => String(t.subject).startsWith('[equipe-acrescimo]'));
    expect(mine.map((t: any) => t.category)).toEqual(['clientes']);
  });

  it('sem scope=staff (Central de Ajuda), cliente+gerente vê só os PRÓPRIOS chamados, de qualquer categoria', async () => {
    const gerente = await createAccount(['cliente', 'gerente_clientes'], 'cliente');
    await prisma.supportTicket.createMany({
      data: [
        { conversationId: 'conv-eq-3', openedBy: { userId: 'outra-pessoa', role: 'cliente', name: 'X' }, category: 'clientes', subject: '[equipe-acrescimo] de outro' },
        { conversationId: 'conv-eq-4', openedBy: { userId: gerente.user.id, role: 'cliente', name: 'Eu' }, category: 'lojistas', subject: '[equipe-acrescimo] meu' },
      ],
    });

    const res = await request(app).get('/api/support/tickets').set('Authorization', `Bearer ${gerente.token}`);

    expect(res.status).toBe(200);
    const mine = res.body.filter((t: any) => String(t.subject).startsWith('[equipe-acrescimo]'));
    expect(mine.map((t: any) => t.subject)).toEqual(['[equipe-acrescimo] meu']);
  });

  it('cliente puro com scope=staff continua vendo só os próprios', async () => {
    const puro = await createAccount(['cliente'], 'cliente');
    await prisma.supportTicket.create({
      data: { conversationId: 'conv-eq-5', openedBy: { userId: 'outra-pessoa', role: 'cliente', name: 'X' }, category: 'clientes', subject: '[equipe-acrescimo] de outro' },
    });
    const res = await request(app).get('/api/support/tickets?scope=staff').set('Authorization', `Bearer ${puro.token}`);
    expect(res.status).toBe(200);
    expect(res.body.filter((t: any) => String(t.subject).startsWith('[equipe-acrescimo]'))).toEqual([]);
  });

  it('CEO atribuir marketing mantém a pessoa como cliente (papel ativo não vira equipe)', async () => {
    const ceo = await createAccount(['ceo', 'cliente'], 'ceo', 'ceo');
    const alvo = await createAccount(['cliente'], 'cliente');

    const res = await request(app)
      .put(`/api/admin/users/${alvo.user.id}/roles`)
      .set('Authorization', `Bearer ${ceo.token}`)
      .send({ roles: ['cliente', 'marketing'] });

    expect(res.status).toBe(200);
    const saved = await prisma.user.findUnique({ where: { id: alvo.user.id } });
    expect(saved!.activeRole).toBe('cliente');
    expect([...(saved!.roles || [])].sort()).toEqual(['cliente', 'marketing']);
  });
});

describe('revisão — negativos e pontos restantes', () => {
  afterEach(async () => {
    const convs = await prisma.conversation.findMany({ where: { relatedOrderNumber: 'equipe-acrescimo' }, select: { id: true } });
    const ids = convs.map((c) => c.id);
    await prisma.message.deleteMany({ where: { conversationId: { in: ids } } });
    await prisma.supportTicket.deleteMany({ where: { conversationId: { in: ids } } });
    await prisma.conversation.deleteMany({ where: { id: { in: ids } } });
  });

  it('ceo em roles com papel ativo cliente não vale como acréscimo: 403 em rota de permissão', async () => {
    const conta = await createAccount(['ceo', 'cliente'], 'cliente');
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${conta.token}`);
    expect(res.status).toBe(403);
    const me = await request(app).get('/api/role-permissions/me').set('Authorization', `Bearer ${conta.token}`);
    expect(me.body.permissions).not.toContain('*');
  });

  it('ceo em roles com papel ativo cliente: authorizeCEO recusa', async () => {
    const { authorizeCEO } = await import('../middleware/authorize');
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const next = jest.fn();
    authorizeCEO({ user: { id: 'x', role: 'cliente', activeRole: 'cliente', roles: ['ceo', 'cliente'] } } as any, { status, json } as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it('broadcast para destino fora da união de notificationTargets → 403', async () => {
    const equipe = await createAccount(['cliente', 'marketing'], 'cliente');
    const res = await request(app)
      .post('/api/broadcasts')
      .set('Authorization', `Bearer ${equipe.token}`)
      .send({ title: '[equipe-acrescimo] fora', body: 'teste', targetRoles: ['lojista'] });
    expect(res.status).toBe(403);
  });

  it('optionalAuth não copia roles do token (papéis só valem lidos do banco)', async () => {
    const { optionalAuth } = await import('../middleware/auth');
    const token = jwt.sign({ id: 'x', role: 'cliente', activeRole: 'cliente', roles: ['cliente', 'marketing'] }, TEST_JWT_SECRET, { expiresIn: '1h' });
    const req: any = { headers: { authorization: `Bearer ${token}` }, cookies: {} };
    optionalAuth(req, {} as any, jest.fn());
    expect(req.user.id).toBe('x');
    expect(req.user.roles).toBeUndefined();
  });

  it('cliente+gerente_motoboys (papel ativo cliente) vê a carteira de um motoboy; cliente puro não', async () => {
    const gerente = await createAccount(['cliente', 'gerente_motoboys'], 'cliente');
    const puro = await createAccount(['cliente'], 'cliente');
    const moto = await createAccount(['motoboy', 'cliente'], 'motoboy', 'motoboy');

    const ok = await request(app).get(`/api/wallets/motoboy/${moto.user.id}`).set('Authorization', `Bearer ${gerente.token}`);
    expect(ok.status).toBe(200);
    const negado = await request(app).get(`/api/wallets/motoboy/${moto.user.id}`).set('Authorization', `Bearer ${puro.token}`);
    expect(negado.status).toBe(403);
  });

  it('resposta do gerente (papel ativo cliente) em conversa de suporte sai com selo "suporte"', async () => {
    const cliente = await createAccount(['cliente'], 'cliente');
    const gerente = await createAccount(['cliente', 'gerente_clientes'], 'cliente');
    const conv = await prisma.conversation.create({
      data: {
        type: 'suporte' as any,
        supportCategory: 'clientes' as any,
        relatedOrderNumber: 'equipe-acrescimo',
        participant1: { userId: cliente.user.id, role: 'cliente', name: 'Cliente' },
        participant2: { userId: gerente.user.id, role: 'gerente', name: 'Gerente' },
      },
    });
    await prisma.supportTicket.create({
      data: {
        conversationId: conv.id,
        openedBy: { userId: cliente.user.id, role: 'cliente', name: 'Cliente' },
        assignedTo: [{ userId: gerente.user.id, name: 'Gerente' }],
        category: 'clientes',
        subject: '[equipe-acrescimo] chat',
      },
    });

    const res = await request(app)
      .post(`/api/chat/conversations/${conv.id}/messages`)
      .set('Authorization', `Bearer ${gerente.token}`)
      .send({ text: 'Olá, sou do suporte' });

    expect(res.status).toBeLessThan(300);
    const msg = await prisma.message.findFirst({ where: { conversationId: conv.id } });
    expect(msg!.senderRole).toBe('suporte');
  });
});
