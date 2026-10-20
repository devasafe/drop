/**
 * D3b-3 · P1.1 — fundação do registro único de ações de dinheiro do admin.
 * recordAdminMoneyAction grava na transação recebida (some no rollback), exige autor e alvo,
 * a chave de idempotência é única, o enum tem os 17 tipos da spec 3.1, o schema ganhou os
 * campos novos e a permissão money:overview existe, é só do CEO por padrão e é concedível.
 */
import crypto from 'crypto';
import request from 'supertest';
import { Prisma, AdminMoneyActionType } from '@prisma/client';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import {
  recordAdminMoneyAction,
  actorFromRequest,
  MoneyActionError,
  sendMoneyActionError,
  moneyActionErrorBody,
  ADMIN_MONEY_TARGET_TYPES,
} from '../services/adminMoneyAction.service';
import { ALL_PERMISSIONS, CEO_ONLY_PERMISSIONS, getEffectivePermissions } from '../controllers/rolePermissionsController';
import { hasPermission } from '../utils/walletCalculations';

const DOMAIN = '@d3b3p11.test';
let ceo: TestUser;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
});
afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

const SPEC_TYPES = [
  'payout_release', 'payout_block', 'payout_unblock', 'payout_mark_paid', 'payout_resolve_uncertain',
  'withdrawal_approve', 'withdrawal_reject', 'withdrawal_resolve_uncertain',
  'cashbox_deposit', 'cashbox_withdrawal_request', 'cashbox_withdrawal_approve', 'cashbox_withdrawal_reject',
  'wallet_adjust', 'commission_sync', 'motoboy_transfer_retry', 'motoboy_transfer_resolve', 'direct_refund_resolve',
  // D3b-1: cancelamento com estorno pelo admin
  'order_admin_cancel',
];

describe('schema da D3b-3', () => {
  it('o enum AdminMoneyActionType tem exatamente os 17 tipos da spec 3.1 e o cancelamento do admin (D3b-1)', () => {
    expect(Object.values(AdminMoneyActionType).sort()).toEqual([...SPEC_TYPES].sort());
  });

  it('PayoutStatus ganhou releasing e WalletEntryCategory ganhou adjustment', () => {
    expect(Object.values(Prisma.PayoutScalarFieldEnum)).toEqual(
      expect.arrayContaining(['uncertainAt', 'resolvedBy', 'resolvedAt', 'resolutionNote']),
    );
    expect(Object.values(Prisma.WithdrawalScalarFieldEnum)).toContain('requestedBy');
    const { PayoutStatus, WalletEntryCategory } = require('@prisma/client');
    expect(Object.values(PayoutStatus)).toContain('releasing');
    expect(Object.values(WalletEntryCategory)).toContain('adjustment');
  });

  it('os alvos aceitos são os da spec 3.1', () => {
    expect([...ADMIN_MONEY_TARGET_TYPES].sort()).toEqual([
      'cashbox', 'cashbox_withdrawal', 'direct_refund', 'motoboy_transfer', 'order', 'payout',
      'plan_commission', 'verification', 'wallet', 'withdrawal_request',
    ]);
  });
});

describe('recordAdminMoneyAction', () => {
  it('grava a linha com autor, papel, alvo, valor arredondado, motivo e antes/depois', async () => {
    const targetId = `t-${crypto.randomUUID()}`;
    const row = await prisma.$transaction((tx) =>
      recordAdminMoneyAction(tx, {
        actor: { id: ceo.userId, role: 'ceo' },
        type: 'payout_block',
        targetType: 'payout',
        targetId,
        amount: 12.345,
        reason: '  suspeita de fraude  ',
        before: { status: 'pending', blocked: false },
        after: { status: 'pending', blocked: true },
      }),
    );
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    const db = await prisma.adminMoneyAction.findUnique({ where: { id: row.id } });
    expect(db).toMatchObject({
      actorId: ceo.userId, actorRole: 'ceo', type: 'payout_block', targetType: 'payout', targetId,
      reason: 'suspeita de fraude', before: { status: 'pending', blocked: false }, after: { status: 'pending', blocked: true },
      idempotencyKey: null,
    });
    expect(Number(db!.amount)).toBe(12.35);
  });

  it('a linha some se a transação da ação for desfeita', async () => {
    const targetId = `t-${crypto.randomUUID()}`;
    await expect(
      prisma.$transaction(async (tx) => {
        await recordAdminMoneyAction(tx, { actor: { id: ceo.userId, role: 'ceo' }, type: 'payout_unblock', targetType: 'payout', targetId });
        throw new Error('falha depois da linha');
      }),
    ).rejects.toThrow('falha depois da linha');
    expect(await prisma.adminMoneyAction.count({ where: { targetId } })).toBe(0);
  });

  it('sem autor ou sem alvo lança e não grava nada', async () => {
    const targetId = `t-${crypto.randomUUID()}`;
    await expect(
      prisma.$transaction((tx) => recordAdminMoneyAction(tx, { actor: { id: '', role: 'ceo' }, type: 'wallet_adjust', targetType: 'wallet', targetId })),
    ).rejects.toThrow(/sem autor/);
    await expect(
      prisma.$transaction((tx) => recordAdminMoneyAction(tx, { actor: { id: ceo.userId, role: 'ceo' }, type: 'wallet_adjust', targetType: 'wallet', targetId: ' ' })),
    ).rejects.toThrow(/sem alvo/);
    expect(await prisma.adminMoneyAction.count({ where: { targetId } })).toBe(0);
  });

  it('a chave de idempotência é única (a segunda gravação com a mesma chave falha com P2002)', async () => {
    const key = crypto.randomUUID();
    const input = { actor: { id: ceo.userId, role: 'ceo' }, type: 'wallet_adjust' as const, targetType: 'wallet' as const, targetId: 'w1', amount: 10, idempotencyKey: key };
    await prisma.$transaction((tx) => recordAdminMoneyAction(tx, input));
    await expect(prisma.$transaction((tx) => recordAdminMoneyAction(tx, input))).rejects.toMatchObject({ code: 'P2002' });
    expect(await prisma.adminMoneyAction.count({ where: { idempotencyKey: key } })).toBe(1);
  });
});

describe('actorFromRequest e MoneyActionError', () => {
  it('lê o autor do req autenticado (papel ativo primeiro) e lança sem id', () => {
    expect(actorFromRequest({ user: { id: 'u1', role: 'cliente', activeRole: 'gerente_geral' } })).toEqual({ id: 'u1', role: 'gerente_geral' });
    expect(actorFromRequest({ user: { id: 'u2', role: 'ceo' } })).toEqual({ id: 'u2', role: 'ceo' });
    // Papel de equipe é acréscimo (fix/equipe-acrescimo): com papel ativo 'cliente', o autor
    // aparece no Histórico pelo papel de equipe da conta, não como cliente.
    expect(actorFromRequest({ user: { id: 'u3', role: 'cliente', activeRole: 'cliente', roles: ['cliente', 'gerente_geral'] } }))
      .toEqual({ id: 'u3', role: 'gerente_geral' });
    expect(actorFromRequest({ user: { id: 'u4', role: 'ceo', activeRole: 'ceo', roles: ['ceo', 'gerente_geral'] } }))
      .toEqual({ id: 'u4', role: 'ceo' });
    expect(() => actorFromRequest({})).toThrow(/sem autor/);
  });

  it('sendMoneyActionError responde status + { error, code, ...details } e ignora outros erros', () => {
    const json = jest.fn();
    const res: any = { status: jest.fn(() => ({ json })) };
    const err = new MoneyActionError(409, 'PAYOUT_NOT_PENDING', 'Repasse não está pendente', { currentStatus: 'released', blocked: false });
    expect(moneyActionErrorBody(err)).toEqual({ error: 'Repasse não está pendente', code: 'PAYOUT_NOT_PENDING', currentStatus: 'released', blocked: false });
    expect(sendMoneyActionError(res, err)).toBe(true);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({ error: 'Repasse não está pendente', code: 'PAYOUT_NOT_PENDING', currentStatus: 'released', blocked: false });
    expect(sendMoneyActionError(res, new Error('outro'))).toBe(false);
    expect(res.status).toHaveBeenCalledTimes(1);
  });
});

describe('permissão money:overview', () => {
  it('está no catálogo, só o CEO tem por padrão e não é exclusiva do CEO', async () => {
    const entry = ALL_PERMISSIONS.find((p) => p.key === 'money:overview');
    expect(entry).toEqual({ key: 'money:overview', label: 'Ver a visão geral do dinheiro e o histórico de ações', category: 'Financeiro — Visão geral' });
    expect(hasPermission('ceo', 'money:overview')).toBe(true);
    for (const role of ['marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys', 'lojista', 'cliente', 'motoboy']) {
      expect(hasPermission(role, 'money:overview')).toBe(false);
    }
    expect(CEO_ONLY_PERMISSIONS).not.toContain('money:overview');
  });

  it('o CEO consegue conceder a outro papel em Permissões (e o catálogo chega ao painel)', async () => {
    const list = await request(app).get('/api/role-permissions').set('Authorization', bearer(ceo));
    expect(list.status).toBe(200);
    expect(list.body.allPermissions.map((p: any) => p.key)).toContain('money:overview');

    const previous = await prisma.rolePermissions.findUnique({ where: { role: 'gerente_geral' } });
    try {
      const base = (await getEffectivePermissions('gerente_geral')).permissions;
      const r = await request(app).put('/api/role-permissions/gerente_geral').set('Authorization', bearer(ceo))
        .send({ permissions: [...base, 'money:overview'], notificationTargets: [] });
      expect(r.status).toBe(200);
      expect((await getEffectivePermissions('gerente_geral')).permissions).toContain('money:overview');
    } finally {
      if (previous) {
        await prisma.rolePermissions.update({
          where: { role: 'gerente_geral' },
          data: { permissions: previous.permissions, notificationTargets: previous.notificationTargets, updatedBy: previous.updatedBy },
        });
      } else {
        await prisma.rolePermissions.deleteMany({ where: { role: 'gerente_geral' } });
      }
    }
  });
});
