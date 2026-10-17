/**
 * D3b-3 · P4.1 — peças sem tela da P4: formatos e rótulos de /admin/money/* (lib/adminMoney),
 * mensagens dos códigos novos de dinheiro (moneyErrors) e o 403 que não é falta de permissão (adminErrors).
 */
import { adminErrorMessage } from '../lib/adminErrors';
import {
  ACTION_TYPE_LABEL, ADMIN_MONEY_ACTION_TYPES, MONEY_MOVEMENT_TYPES, MOVEMENT_TYPE_LABEL, UUID_V4_RE,
  actionTargetLabel, actorLabel, isMoneySummary, newIdempotencyKey, plural, shortId, spDateTime, spTime,
  summarizeMoneyChange, uuidFromBytes,
} from '../lib/adminMoney';
import { flattenMoneyError, moneyErrorMessage } from '../components/admin/dinheiro/moneyErrors';

const http = (status: number, data: Record<string, unknown>) => ({ response: { status, data } });

const CUSTODIA = {
  mode: 'custodia', day: '2026-10-16',
  custody: { amount: 1234.5, count: 12 },
  toRelease: { amount: 800, count: 9, uncertain: 1 },
  withdrawalsToday: { amount: 350, count: 3, pending: 2, uncertain: 0 },
  refunds: null,
  platformRevenueToday: 87.4,
  whereMoneyWent: { orders: 15, inFromCustomers: 1503.2, toStores: 1270, toMotoboys: 120, gatewayCost: 3.1, platform: 110.1 },
};
const DIRETO = {
  ...CUSTODIA, mode: 'direto', custody: null, toRelease: null, refunds: { amount: 129.9, count: 1 },
  whereMoneyWent: { orders: 2, inFromCustomers: 300, toStores: 270, toMotoboys: 30, gatewayCost: 0, platform: 0 },
};

describe('isMoneySummary (fail closed: resposta fora do contrato vira erro, nunca zero)', () => {
  it('aceita os dois modos do contrato da P3', () => {
    expect(isMoneySummary(CUSTODIA)).toBe(true);
    expect(isMoneySummary(DIRETO)).toBe(true);
  });
  it.each([
    ['nulo', null],
    ['modo desconhecido', { ...CUSTODIA, mode: 'outro' }],
    ['custódia sem "A liberar"', { ...CUSTODIA, toRelease: null }],
    ['custódia sem a custódia', { ...CUSTODIA, custody: null }],
    ['direto sem estornos', { ...DIRETO, refunds: null }],
    ['receita em texto', { ...CUSTODIA, platformRevenueToday: '87.4' }],
    ['saques sem a contagem de pedidos', { ...CUSTODIA, withdrawalsToday: { amount: 1, count: 1 } }],
    ['"Para onde foi" incompleto', { ...CUSTODIA, whereMoneyWent: { orders: 1 } }],
  ])('recusa %s', (_nome, v) => {
    expect(isMoneySummary(v)).toBe(false);
  });
});

describe('rótulos', () => {
  it('os 17 tipos de ação da spec 3.1 têm rótulo em português', () => {
    expect(ADMIN_MONEY_ACTION_TYPES).toHaveLength(17);
    expect(Object.keys(ACTION_TYPE_LABEL).sort()).toEqual([...ADMIN_MONEY_ACTION_TYPES].sort());
    expect(ACTION_TYPE_LABEL.wallet_adjust).toBe('Saldo ajustado');
    expect(ACTION_TYPE_LABEL.payout_resolve_uncertain).toBe('Repasse incerto resolvido');
    expect(ACTION_TYPE_LABEL.commission_sync).toBe('Comissão do plano aplicada às lojas');
  });

  it('os 7 tipos de movimento da P3 têm rótulo de filtro', () => {
    expect(Object.keys(MOVEMENT_TYPE_LABEL).sort()).toEqual([...MONEY_MOVEMENT_TYPES].sort());
    expect(MOVEMENT_TYPE_LABEL.withdrawal_paid).toBe('Saques pagos');
  });

  it('alvo: plano pelo número; o resto pelo tipo e o fim do id', () => {
    expect(actionTargetLabel('plan_commission', 'plan2')).toBe('Plano 2');
    expect(actionTargetLabel('payout', 'clxyz0123456')).toBe('Repasse #123456');
    expect(actionTargetLabel('wallet', 'w1')).toBe('Carteira #w1');
    expect(actionTargetLabel('cashbox_withdrawal', 'cw0000000009')).toBe('Retirada do caixa #000009');
    expect(actionTargetLabel('outra_coisa', 'abc')).toBe('outra_coisa #abc');
  });

  it('quem: nome e papel; pessoa apagada não some', () => {
    expect(actorLabel({ actorName: 'Carla Lima', actorRole: 'ceo' })).toBe('Carla Lima · CEO');
    expect(actorLabel({ actorName: null, actorRole: 'gerente_geral' })).toBe('Pessoa removida · Gerente geral');
  });

  it('shortId e plural', () => {
    expect(shortId('clx3k2abcdef')).toBe('#abcdef');
    expect(plural(1, 'repasse', 'repasses')).toBe('1 repasse');
    expect(plural(0, 'repasse', 'repasses')).toBe('0 repasses');
  });

  it('hora e data no fuso de São Paulo (o dia do painel é o de São Paulo)', () => {
    expect(spTime('2026-10-16T15:04:05.123Z')).toBe('12:04');
    expect(spTime('2026-10-17T02:30:00.000Z')).toBe('23:30');
    expect(spDateTime('2026-10-16T14:00:00.000Z')).toMatch(/16\/10.*11:00/);
  });
});

describe('summarizeMoneyChange (coluna "Antes → depois" do Histórico)', () => {
  it.each([
    ['situação', { status: 'pending' }, { status: 'released' }, 'pendente → liberado'],
    ['liberação incerta', { status: 'pending' }, { status: 'releasing', uncertain: true, gatewayTransferId: null }, 'pendente → em liberação · incerto'],
    ['ajuste de saldo', { balance: 10 }, { balance: 35.5, direction: 'credit', walletEntryId: 'e1' }, 'saldo R$ 10,00 → R$ 35,50 · crédito'],
    ['débito', { balance: 35.5 }, { balance: 5.5, direction: 'debit' }, 'saldo R$ 35,50 → R$ 5,50 · débito'],
    ['comissão mantendo especiais', { value: 15 }, { value: 12, choice: 'keep_special', storesUpdated: 3 }, '15% → 12% · manteve as especiais · 3 lojas atualizadas'],
    ['comissão igualada', { value: 15 }, { value: 12.5, choice: 'all', storesUpdated: 1 }, '15% → 12,5% · igualou todas · 1 loja atualizada'],
    ['retirada aprovada por quem pediu', { status: 'pending', requestedBy: 'u1' }, { status: 'approved', approvedBy: 'u1', selfApproved: true }, 'pendente → aprovado · aprovou a própria retirada'],
    ['saque incerto resolvido', { status: 'approved', uncertainAt: '2026-10-16T10:00:00Z' }, { status: 'pending', outcome: 'not_sent' }, 'aprovado → pendente · conferido: não enviado'],
    ['retirada pedida (sem antes)', null, { status: 'pending', requestedBy: 'u1' }, 'pendente'],
    ['bloquear repasse (F11)', { status: 'pending', blocked: false }, { status: 'pending', blocked: true }, 'pendente · bloqueado'],
    ['desbloquear repasse (F11)', { blocked: true, blockReason: 'x' }, { blocked: false }, 'desbloqueado'],
    ['Pix ao motoboy sem novas tentativas (F11)', { status: 'uncertain' }, { status: 'failed_final' }, 'incerto → falhou (sem novas tentativas)'],
    ['sem dados', null, null, '—'],
  ])('%s', (_nome, before, after, text) => {
    expect(summarizeMoneyChange(before, after)).toBe(text);
  });
});

describe('chave de idempotência do Ajustar saldo', () => {
  it('uuid v4, uma nova a cada chamada', () => {
    const keys = Array.from({ length: 50 }, () => newIdempotencyKey());
    keys.forEach((k) => expect(k).toMatch(UUID_V4_RE));
    expect(new Set(keys).size).toBe(50);
  });
  it('uuidFromBytes: marca a versão 4 e a variante, em minúsculas, sem mexer nos bytes recebidos', () => {
    const ones = new Uint8Array(16).fill(255);
    expect(uuidFromBytes(ones)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(ones[6]).toBe(255);
    expect(uuidFromBytes(new Uint8Array(16))).toBe('00000000-0000-4000-8000-000000000000');
  });
});

describe('moneyErrorMessage (códigos novos da P1 e da P2)', () => {
  it.each([
    ['repasse em andamento', http(409, { code: 'PAYOUT_NOT_PENDING', currentStatus: 'releasing', blocked: false, error: 'x' }),
      'Em andamento: a transferência deste repasse já começou. Se não concluir, ele aparece em "Incertos".'],
    ['repasse bloqueado', http(409, { code: 'PAYOUT_NOT_PENDING', currentStatus: 'pending', blocked: true, error: 'x' }),
      'Bloqueado: desbloqueie antes de liberar.'],
    ['repasse já liberado', http(409, { code: 'PAYOUT_NOT_PENDING', currentStatus: 'paid', blocked: false, error: 'x' }),
      'Este repasse já foi liberado.'],
    ['repasse cancelado', http(409, { code: 'PAYOUT_NOT_PENDING', currentStatus: 'cancelled', blocked: false, error: 'x' }),
      'Cancelado: este repasse não pode ser liberado.'],
    ['não bloqueado', http(409, { code: 'PAYOUT_NOT_BLOCKED', currentStatus: 'pending', blocked: false, error: 'x' }),
      'Este repasse já não está bloqueado.'],
    ['não resolvível', http(409, { code: 'PAYOUT_NOT_RESOLVABLE', currentStatus: 'released', uncertainAt: null, error: 'x' }),
      'Este repasse já foi resolvido (ou não está mais incerto). A lista foi atualizada.'],
    ['incerto', http(502, { code: 'PAYOUT_TRANSFER_UNCERTAIN', currentStatus: 'releasing', error: 'x' }),
      'O Asaas não confirmou a transferência: o repasse ficou incerto. Confira no painel do Asaas e use "Resolver".'],
    ['recusado e devolvido à fila', http(502, { code: 'PAYOUT_TRANSFER_REFUSED', currentStatus: 'pending', error: 'Transferência no Asaas não concluída: conta inválida.' }),
      'Transferência no Asaas não concluída: conta inválida. O repasse voltou para "Aguardando liberação".'],
    ['recusado sem devolução', http(502, { code: 'PAYOUT_TRANSFER_REFUSED', currentStatus: 'releasing', error: 'Transferência no Asaas não concluída: conta inválida' }),
      'Transferência no Asaas não concluída: conta inválida'],
    ['repasse sumiu', http(404, { code: 'PAYOUT_NOT_FOUND', error: 'Payout não encontrado' }),
      'Repasse não encontrado. Atualize a lista.'],
    ['autoaprovação do caixa (403 que não é permissão)', http(403, { code: 'CASHBOX_SELF_APPROVAL', error: 'Outra pessoa precisa aprovar esta retirada' }),
      'Outra pessoa precisa aprovar esta retirada'],
    ['retirada já decidida', http(409, { code: 'CASHBOX_WITHDRAWAL_NOT_PENDING', currentStatus: 'approved', error: 'x' }),
      'Esta retirada já foi decidida. A lista foi atualizada.'],
    ['saldo insuficiente', http(409, { code: 'INSUFFICIENT_BALANCE', available: 10, error: 'x' }),
      'Saldo insuficiente para este débito: a carteira tem R$ 10,00.'],
    ['saldo insuficiente sem o disponível', http(409, { code: 'INSUFFICIENT_BALANCE', error: 'x' }),
      'Saldo insuficiente para este débito.'],
    ['ajuste já usado com outros valores', http(409, { code: 'IDEMPOTENCY_KEY_REUSED', actionId: 'a1', error: 'x' }),
      'Este ajuste já foi usado com outros valores. Feche e abra de novo para fazer um ajuste novo.'],
    ['saque já decidido', http(409, { code: 'WITHDRAWAL_NOT_PENDING', currentStatus: 'approved', error: 'x' }),
      'Este saque já foi decidido. A lista foi atualizada.'],
    ['verificação já decidida (texto do servidor em inglês)', http(409, { code: 'VERIFICATION_NOT_PENDING', currentStatus: 'approved', error: 'cnpj não está pendente' }),
      'Esta verificação já foi decidida. A lista foi atualizada.'],
    ['comissão sem escolha (texto do servidor)', http(409, { code: 'COMMISSION_SYNC_CHOICE_REQUIRED', plans: ['plan1'], error: 'Escolha o que fazer com as lojas dos planos com comissão alterada' }),
      'Escolha o que fazer com as lojas dos planos com comissão alterada'],
    ['código desconhecido: texto do servidor', http(400, { error: 'Motivo obrigatório' }), 'Motivo obrigatório'],
    ['403 de permissão', http(403, { error: 'Permissão negada. Você precisa de: payout:release' }), 'Você não tem permissão para isso'],
  ])('%s', (_nome, err, text) => {
    expect(moneyErrorMessage(err)).toBe(text);
  });

  it('flattenMoneyError: texto em português, com status, código e campos do corpo preservados', () => {
    const f = flattenMoneyError(http(409, {
      code: 'PAYOUT_NOT_PENDING', currentStatus: 'released', blocked: false, error: 'Repasse não está pendente (status atual: released)',
    }));
    expect(f).toEqual({
      response: { status: 409, data: { code: 'PAYOUT_NOT_PENDING', currentStatus: 'released', blocked: false, error: 'Este repasse já foi liberado.' } },
    });
  });

  it('flattenMoneyError: erro de rede vira o texto de conexão', () => {
    expect(flattenMoneyError({ message: 'Network Error' }).response.data.error).toBe('Sem conexão com o servidor. Tente de novo.');
  });
});

describe('adminErrorMessage: 403 com texto próprio só para CASHBOX_SELF_APPROVAL', () => {
  it('CASHBOX_SELF_APPROVAL mostra o texto do servidor', () => {
    expect(adminErrorMessage(http(403, { code: 'CASHBOX_SELF_APPROVAL', error: 'Outra pessoa precisa aprovar esta retirada' })))
      .toBe('Outra pessoa precisa aprovar esta retirada');
  });
  it('outro 403, com ou sem código, continua "sem permissão"', () => {
    expect(adminErrorMessage(http(403, { code: 'CEO_ONLY', error: 'Só o CEO altera estas configurações.' }))).toBe('Você não tem permissão para isso');
    expect(adminErrorMessage(http(403, { error: 'Permissão negada' }))).toBe('Você não tem permissão para isso');
  });
});
