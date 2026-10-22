/**
 * Permissões, Parte 2 (22/10): a tela é só dos papéis da equipe. Cliente, lojista e motoboy ficam fixos no
 * padrão estático, inclusive no servidor: o PUT recusa e uma linha antiga no banco não dá nem tira acesso.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { rolePermissions } from '../utils/walletCalculations';
import { getEffectivePermissions } from '../controllers/rolePermissionsController';
import { ALL_PERMISSIONS, RETIRED_PERMISSIONS, ROLE_DESCRIPTIONS } from '../services/permissions/catalog';

const DOMAIN = '@permissoes-parte2.test';
const FIXED = ['cliente', 'lojista', 'motoboy'] as const;
const TEAM = ['marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'];
const NOT_EDITABLE = { error: 'Esse papel não tem permissões editáveis.', code: 'ROLE_NOT_EDITABLE' };
let ceo: TestUser;
let saved: any[] = [];

beforeAll(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  saved = await prisma.rolePermissions.findMany({ where: { role: { in: [...FIXED] } } });
});
afterEach(async () => {
  await prisma.rolePermissions.deleteMany({ where: { role: { in: [...FIXED] } } });
  for (const row of saved) await prisma.rolePermissions.create({ data: row });
});
afterAll(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
  await prisma.$disconnect();
});

describe('PUT /role-permissions/:role', () => {
  it.each([...FIXED, 'ceo'])('%s: 400 ROLE_NOT_EDITABLE e nada gravado', async (role) => {
    await prisma.rolePermissions.deleteMany({ where: { role: role as any } });
    const res = await request(app).put(`/api/role-permissions/${role}`).set('Authorization', bearer(ceo))
      .send({ permissions: ['order:create'] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(NOT_EDITABLE);
    expect(await prisma.rolePermissions.findUnique({ where: { role: role as any } })).toBeNull();
  });

  it('papel da equipe continua editável', async () => {
    const before = await prisma.rolePermissions.findUnique({ where: { role: 'marketing' } });
    try {
      const res = await request(app).put('/api/role-permissions/marketing').set('Authorization', bearer(ceo))
        .send({ permissions: ['theme:edit'] });
      expect(res.status).toBe(200);
    } finally {
      if (before) {
        await prisma.rolePermissions.update({
          where: { role: 'marketing' },
          data: { permissions: before.permissions, notificationTargets: before.notificationTargets, updatedBy: before.updatedBy },
        });
      } else {
        await prisma.rolePermissions.deleteMany({ where: { role: 'marketing' } });
      }
    }
  });
});

describe('cliente, lojista e motoboy: sempre o padrão estático', () => {
  it('uma linha antiga de lojista não dá nem tira acesso: /me devolve o padrão', async () => {
    await prisma.rolePermissions.upsert({
      where: { role: 'lojista' },
      create: { role: 'lojista', permissions: ['user:view_all', 'settings:manage'], notificationTargets: [], updatedBy: 'test' },
      update: { permissions: ['user:view_all', 'settings:manage'] },
    });
    const lojista = await createTestUser('lojista', DOMAIN);
    const me = await request(app).get('/api/role-permissions/me').set('Authorization', bearer(lojista));
    expect(me.status).toBe(200);
    expect([...me.body.permissions].sort()).toEqual(rolePermissions.lojista.filter((p) => !RETIRED_PERMISSIONS.includes(p)).sort());
    const settings = await request(app).get('/api/admin/settings').set('Authorization', bearer(lojista));
    expect(settings.status).toBe(403);
  });

  it.each(FIXED)('%s: getEffectivePermissions ignora a linha do banco', async (role) => {
    await prisma.rolePermissions.upsert({
      where: { role },
      create: { role, permissions: [], notificationTargets: [], updatedBy: 'test' },
      update: { permissions: [] },
    });
    const eff = await getEffectivePermissions(role);
    // Rodada final (I1): o padrão estático também perde as aposentadas (ex.: wallet:transfer do motoboy).
    expect(eff.permissions).toEqual((rolePermissions[role] || []).filter((p) => !RETIRED_PERMISSIONS.includes(p)));
  });
});

describe('GET /role-permissions (a tela)', () => {
  it('só os papéis da equipe; catálogo sem chaves de uso no app; explicações de permissão e de papel', async () => {
    const res = await request(app).get('/api/role-permissions').set('Authorization', bearer(ceo));
    expect(res.status).toBe(200);
    expect(res.body.roles.map((r: any) => r.role)).toEqual(TEAM);
    expect(res.body.allRoles).toEqual(TEAM);
    // Os grupos que recebem aviso continuam todos (cliente, lojista e motoboy recebem broadcast).
    expect(res.body.notificationTargetRoles).toEqual(expect.arrayContaining(['cliente', 'lojista', 'motoboy', ...TEAM]));
    expect(res.body.allPermissions.some((p: any) => p.kind === 'app')).toBe(false);
    expect(res.body.allPermissions.every((p: any) => typeof p.description === 'string' && p.description.length > 10)).toBe(true);
    expect(res.body.roleDescriptions).toEqual(ROLE_DESCRIPTIONS);
  });
});

describe('catálogo: grupos pelo menu', () => {
  it('cada caixinha do painel tem grupo do menu; Dinheiro tem subgrupo', () => {
    const groups = new Set(ALL_PERMISSIONS.filter((p) => p.kind !== 'app').map((p) => p.category));
    expect([...groups]).toEqual([
      'Operação ao vivo', 'Verificações', 'Usuários', 'Lojas e planos', 'Dinheiro',
      'Suporte e conversas', 'Avisos e notificações', 'Regras e taxas', 'Tema sazonal',
    ]);
    const money = ALL_PERMISSIONS.filter((p) => p.category === 'Dinheiro');
    expect(new Set(money.map((p) => p.subgroup))).toEqual(new Set(['Visão geral', 'Repasses', 'Saques', 'Caixa', 'Carteiras']));
    expect(ALL_PERMISSIONS.find((p) => p.key === 'user:view_motoboys')?.description)
      .toBe('Abre Usuários só com a aba Motoboys. Vê a ficha, mas não edita.');
    expect(ROLE_DESCRIPTIONS.gerente_motoboys).toBe('Gerente de motoboys: cuida dos entregadores: cadastro, verificação, ficha e repasses.');
  });
});
