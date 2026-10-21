/**
 * D3b-2b · P3.1 — peças sem tela. lib/adminVerificacoes: motivos padronizados e corpo da recusa, "há quanto tempo",
 * alvo e data de envio de cada item, média de espera, "Aprovar tudo" pela rota única (uma chamada por sujeito) e o
 * aviso do 409 VERIFICATION_CHANGED. lib/adminAccounts: ficha da loja com os campos novos (fail closed), estender
 * teste, cancelar mensalidade, plano cancelado, histórico Asaas, rótulos e códigos novos.
 */
import api from '../lib/api';
import {
  approveAllUrl, avgWaitText, buildRejectBody, buildVerificationPeople, isVerificationChanged, isVerificationStats,
  oldestSubmittedAt, REJECT_MESSAGE_MAX, REJECT_REASON_LABEL, REJECT_REASONS, rejectReady, verificationChangedText,
  waitingText, type VerificationPerson,
} from '../lib/adminVerificacoes';
import {
  accountErrorMessage, actionLabel, asaasAuditLabel, cancelSaas, consentText, extendTrial, isAccountConflict,
  isStoreDetail, saasPlanText, storeNameMatches, timelineDetail, TRIAL_DAYS, trialEndPreview,
} from '../lib/adminAccounts';
import { FULL, LOJA, PAULO_DOC, PAULO_FACIAL, type QueueFixture } from './helpers/verificacoesFixtures';

jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));

const post = api.post as jest.Mock;
const http = (status: number, data: Record<string, unknown>) => ({ response: { status, data } });
const NOW = Date.parse('2026-10-21T15:00:00.000Z');

const lists = (q: QueueFixture) => ({
  docs: (q.pending ?? []) as Record<string, unknown>[],
  stores: (q.stores ?? []) as Record<string, unknown>[],
  facialOwners: (q.facial ?? []) as Record<string, unknown>[],
  motoboys: (q.motoboys ?? []) as Record<string, unknown>[],
});

beforeEach(() => jest.clearAllMocks());

describe('recusa padronizada', () => {
  it('os 7 motivos, na ordem e com os rótulos do servidor', () => {
    expect(REJECT_REASONS.map((r) => r.value)).toEqual([
      'illegible', 'face_mismatch', 'expired', 'data_mismatch', 'cnpj_invalid', 'address_unproven', 'other',
    ]);
    expect(REJECT_REASON_LABEL).toEqual({
      illegible: 'Foto ilegível',
      face_mismatch: 'Selfie não confere com o documento',
      expired: 'Documento vencido',
      data_mismatch: 'Dados não conferem',
      cnpj_invalid: 'CNPJ inválido ou inativo',
      address_unproven: 'Comprovante de endereço não aceito',
      other: 'Outro motivo',
    });
    expect(REJECT_MESSAGE_MAX).toBe(300);
  });

  it('buildRejectBody: mensagem aparada; vazia não vai; resend sempre vai', () => {
    expect(buildRejectBody('illegible', '   ', true)).toEqual({ reasonCode: 'illegible', resend: true });
    expect(buildRejectBody('other', ' CNH de outra pessoa ', false)).toEqual({ reasonCode: 'other', message: 'CNH de outra pessoa', resend: false });
  });

  it('rejectReady: todo item com motivo; "Outro motivo" exige a mensagem; mensagem até 300', () => {
    expect(rejectReady([], '')).toBe(false);
    expect(rejectReady(['illegible', ''], '')).toBe(false);
    expect(rejectReady(['illegible', 'expired'], '')).toBe(true);
    expect(rejectReady(['other'], '   ')).toBe(false);
    expect(rejectReady(['other'], 'Foto de outra pessoa')).toBe(true);
    expect(rejectReady(['illegible'], 'x'.repeat(301))).toBe(false);
    expect(rejectReady(['illegible'], 'x'.repeat(300))).toBe(true);
  });
});

describe('espera', () => {
  it('waitingText: "há 3 h", "há 2 d", "agora"; sem data ou data inválida = null', () => {
    expect(waitingText('2026-10-21T12:00:00.000Z', NOW)).toBe('há 3 h');
    expect(waitingText('2026-10-19T14:00:00.000Z', NOW)).toBe('há 2 d');
    expect(waitingText('2026-10-21T14:59:40.000Z', NOW)).toBe('agora');
    expect(waitingText(null, NOW)).toBeNull();
    expect(waitingText(undefined, NOW)).toBeNull();
    expect(waitingText('ontem', NOW)).toBeNull();
  });

  it('cada item traz o alvo e a data de envio (null quando o servidor não mandou); a pessoa mostra o envio mais antigo', () => {
    const doc = { ...PAULO_DOC, verification: { document: { ...PAULO_DOC.verification.document, submittedAt: '2026-10-21T12:00:00.000Z' } } };
    const loja = { ...LOJA, verification: { ...LOJA.verification, address: { ...LOJA.verification.address, submittedAt: '2026-10-20T09:00:00.000Z' } } };
    const [paulo] = buildVerificationPeople(lists({ pending: [doc], stores: [loja], facial: [PAULO_FACIAL] }));
    expect(paulo.items.map((i) => [i.kind, i.targetId, i.submittedAt])).toEqual([
      ['document', 'l2', '2026-10-21T12:00:00.000Z'],
      ['facial', 'l2', null],
      ['cnpj', 's1', null],
      ['address', 's1', '2026-10-20T09:00:00.000Z'],
    ]);
    expect(oldestSubmittedAt(paulo)).toBe('2026-10-20T09:00:00.000Z');
    expect(oldestSubmittedAt({ items: [] })).toBeNull();
  });

  it('média: validador estrito e texto em horas (até 48 h) ou dias', () => {
    expect(isVerificationStats({ avgHoursToDecision: 5.2, decisions30d: 41 })).toBe(true);
    expect(isVerificationStats({ avgHoursToDecision: null, decisions30d: 0 })).toBe(true);
    expect(isVerificationStats({ avgHoursToDecision: '5', decisions30d: 41 })).toBe(false);
    expect(isVerificationStats({ avgHoursToDecision: 5 })).toBe(false);
    expect(isVerificationStats(null)).toBe(false);
    expect(avgWaitText({ avgHoursToDecision: 5.2, decisions30d: 41 })).toBe('Espera média até a decisão: 5,2 h · 41 decisões em 30 dias');
    expect(avgWaitText({ avgHoursToDecision: 60, decisions30d: 1 })).toBe('Espera média até a decisão: 2,5 d · 1 decisão em 30 dias');
    expect(avgWaitText({ avgHoursToDecision: null, decisions30d: 0 })).toBe('Espera média: nenhuma decisão com data de envio nos últimos 30 dias');
  });
});

describe('"Aprovar tudo" pela rota única', () => {
  const people = buildVerificationPeople(lists(FULL));
  const byName = (n: string) => people.find((p) => p.name === n) as VerificationPerson;

  it('lojista com uma loja: uma chamada pela loja, com o documento e a selfie do dono', () => {
    expect(approveAllUrl(byName('Paulo Henrique'))).toEqual([{
      url: '/verification/admin/subject/store/s1/approve-all',
      items: ['document', 'facial', 'cnpj', 'address'],
      keys: ['document:l2', 'facial:l2', 'cnpj:s1', 'address:s1'],
      permission: 'verification:review_stores',
    }]);
  });

  it('motoboy e cliente: pelo userId, com a permissão do tipo', () => {
    expect(approveAllUrl(byName('Carlos Lima'))).toEqual([{
      url: '/verification/admin/subject/motoboy/m1/approve-all',
      items: ['facial', 'courier'],
      keys: ['facial:m1', 'courier:m1'],
      permission: 'verification:review_motoboys',
    }]);
    expect(approveAllUrl(byName('Ana Souza'))).toEqual([{
      url: '/verification/admin/subject/client/c1/approve-all',
      items: ['document'],
      keys: ['document:c1'],
      permission: 'verification:review_clients',
    }]);
  });

  it('lojista com duas lojas: uma chamada por loja; o documento e a selfie do dono vão só na primeira', () => {
    const loja2 = { ...LOJA, _id: 's2', name: 'Eletro Norte', verification: { cnpj: LOJA.verification.cnpj } };
    const [paulo] = buildVerificationPeople(lists({ pending: [PAULO_DOC], stores: [LOJA, loja2] }));
    expect(approveAllUrl(paulo).map((c) => [c.url, c.items])).toEqual([
      ['/verification/admin/subject/store/s1/approve-all', ['document', 'cnpj', 'address']],
      ['/verification/admin/subject/store/s2/approve-all', ['cnpj']],
    ]);
  });

  it('lojista sem item de loja na fila (só documento e selfie): pelo userId, como cliente', () => {
    const [paulo] = buildVerificationPeople(lists({ pending: [PAULO_DOC], facial: [PAULO_FACIAL] }));
    expect(paulo.kind).toBe('lojista');
    expect(approveAllUrl(paulo).map((c) => [c.url, c.items, c.permission])).toEqual([
      ['/verification/admin/subject/client/l2/approve-all', ['document', 'facial'], 'verification:review_clients'],
    ]);
    expect(approveAllUrl({ id: 'x', kind: 'cliente', items: [] })).toEqual([]);
  });

  it('409 VERIFICATION_CHANGED: o aviso lista o que está pendente agora (só tipos conhecidos)', () => {
    const changed = http(409, { error: 'x', code: 'VERIFICATION_CHANGED', currentPending: ['document', 'address', 'toString'] });
    expect(isVerificationChanged(changed)).toBe(true);
    expect(isVerificationChanged(http(409, { code: 'VERIFICATION_NOT_PENDING' }))).toBe(false);
    expect(verificationChangedText(changed)).toBe(
      'A verificação mudou enquanto você olhava, e estes itens não foram aprovados. Pendentes agora: Documento, Endereço. Confira antes de aprovar.',
    );
    expect(verificationChangedText(http(409, { error: 'x', code: 'VERIFICATION_CHANGED' }))).toBe(
      'A verificação mudou enquanto você olhava, e estes itens não foram aprovados. A lista foi atualizada.',
    );
  });
});

const SAAS = {
  status: 'trialing' as const,
  trialEndsAt: '2030-11-01T12:00:00.000Z' as string | null,
  paidUntil: null as string | null,
  cancelledAt: null as string | null,
};
const STORE = {
  profile: {
    id: 's1', name: 'Eletro Center', cnpj: '12.345.678/0001-90', owner: { id: 'p9', name: 'Renato Nunes' }, city: 'São Paulo',
    situation: 'open', adminPause: null,
  },
  stats30d: { orders: 120, cancelledByStore: 3, rating: 4.7 },
  reviews: [],
  receiving: { status: 'ok', detail: null },
  plan: { plan: null, mode: 'saas', saas: SAAS },
  orders: [],
  timeline: { items: [], nextCursor: null },
  can: { pause: true, unpause: false, note: true, extendTrial: true, cancelSaas: true },
};
const HIST = {
  audits: [{ action: 'replace', apiKeyLast4: '9f3a', actor: { id: 'p9', name: 'Renato Nunes' }, createdAt: '2026-10-01T12:00:00.000Z' }],
  consent: { termsVersion: '2026-09', ip: '200.1.2.3', acceptedAt: '2026-09-30T12:00:00.000Z', actorRole: 'lojista' },
};

describe('ficha da loja (D3b-2b): formato', () => {
  it('can com extendTrial e cancelSaas; saas com cancelledAt; faltando, a ficha é recusada', () => {
    expect(isStoreDetail(STORE)).toBe(true);
    expect(isStoreDetail({ ...STORE, can: { pause: true, unpause: false, note: true } })).toBe(false);
    expect(isStoreDetail({ ...STORE, can: { ...STORE.can, cancelSaas: 'sim' } })).toBe(false);
    expect(isStoreDetail({ ...STORE, plan: { ...STORE.plan, saas: { status: 'trialing', trialEndsAt: null, paidUntil: null } } })).toBe(false);
    expect(isStoreDetail({ ...STORE, plan: { ...STORE.plan, saas: { ...SAAS, status: 'cancelled', cancelledAt: '2026-10-20T12:00:00.000Z' } } })).toBe(true);
    expect(isStoreDetail({ ...STORE, plan: { ...STORE.plan, saas: { ...SAAS, cancelledAt: 'ontem' } } })).toBe(false);
    expect(isStoreDetail({ ...STORE, plan: { ...STORE.plan, saas: { ...SAAS, coveredUntil: '2030-11-02T02:59:59.999Z' } } })).toBe(true);
    expect(isStoreDetail({ ...STORE, plan: { ...STORE.plan, saas: { ...SAAS, coveredUntil: 'amanhã' } } })).toBe(false);
    expect(isStoreDetail({ ...STORE, plan: { ...STORE.plan, saas: null } })).toBe(true);
  });

  it('histórico Asaas: opcional (só o CEO recebe); se veio, no formato', () => {
    expect(isStoreDetail({ ...STORE, asaasHistory: HIST })).toBe(true);
    expect(isStoreDetail({ ...STORE, asaasHistory: { audits: [], consent: null } })).toBe(true);
    expect(isStoreDetail({ ...STORE, asaasHistory: null })).toBe(true);
    expect(isStoreDetail({
      ...STORE,
      asaasHistory: { audits: [{ ...HIST.audits[0], apiKeyLast4: null, actor: { id: 'x', name: null } }], consent: { ...HIST.consent, ip: null } },
    })).toBe(true);
    expect(isStoreDetail({ ...STORE, asaasHistory: { audits: [{ ...HIST.audits[0], createdAt: 'x' }], consent: null } })).toBe(false);
    expect(isStoreDetail({ ...STORE, asaasHistory: { audits: [] } })).toBe(false);
    expect(isStoreDetail({ ...STORE, asaasHistory: { audits: [], consent: { termsVersion: '2026-09' } } })).toBe(false);
  });
});

describe('estender teste e cancelar mensalidade (rotas do mestre)', () => {
  it('extendTrial: POST com dias e motivo; devolve a mensalidade nova, ou null fora do formato', async () => {
    post.mockResolvedValueOnce({ data: { saas: { ...SAAS, trialEndsAt: '2030-11-15T12:00:00.000Z' } } });
    await expect(extendTrial('s1', 14, 'Lojista pediu mais prazo')).resolves.toEqual({ ...SAAS, trialEndsAt: '2030-11-15T12:00:00.000Z' });
    expect(post).toHaveBeenLastCalledWith('/admin/stores/s1/saas/extend-trial', { days: 14, reason: 'Lojista pediu mais prazo' });
    post.mockResolvedValueOnce({ data: {} });
    await expect(extendTrial('s1', 7, 'Lojista pediu mais prazo')).resolves.toBeNull();
    expect(TRIAL_DAYS).toEqual([7, 14, 30]);
  });

  it('cancelSaas: POST com o motivo (id escapado)', async () => {
    post.mockResolvedValueOnce({ data: { saas: { ...SAAS, status: 'cancelled', cancelledAt: '2026-10-21T12:00:00.000Z' } } });
    await expect(cancelSaas('s/1', 'Lojista encerrou a loja')).resolves.toEqual({ ...SAAS, status: 'cancelled', cancelledAt: '2026-10-21T12:00:00.000Z' });
    expect(post).toHaveBeenLastCalledWith('/admin/stores/s%2F1/saas/cancel', { reason: 'Lojista encerrou a loja' });
  });
});

describe('textos da ficha', () => {
  it('plano cancelado: "vende até" pelo coveredUntil do servidor; "vendeu até" depois; sem o campo, "Cancelada"', () => {
    const cancelled = { ...SAAS, status: 'cancelled' as const };
    // coveredUntil = último instante coberto (P2.5): 18/11 02:59:59.999Z é 17/11 23:59 em Brasília.
    expect(saasPlanText({ ...cancelled, paidUntil: '2026-11-17T00:00:00.000Z', coveredUntil: '2026-11-18T02:59:59.999Z' }, NOW)).toBe('Cancelada · vende até 17/11');
    expect(saasPlanText({ ...cancelled, paidUntil: null, coveredUntil: '2026-10-31T02:59:59.999Z' }, NOW)).toBe('Cancelada · vende até 30/10');
    expect(saasPlanText({ ...cancelled, coveredUntil: '2026-10-11T02:59:59.999Z' }, NOW)).toBe('Cancelada · vendeu até 10/10');
    expect(saasPlanText({ ...cancelled, coveredUntil: null }, NOW)).toBe('Cancelada');
    expect(saasPlanText(cancelled, NOW)).toBe('Cancelada');
    expect(saasPlanText(SAAS, NOW)).toBe('Em teste');
  });

  it('prévia do fim do teste: soma a partir do fim atual, ou de agora se ele já passou', () => {
    expect(trialEndPreview('2026-11-01T12:00:00.000Z', 14, NOW)).toBe('15/11/2026');
    expect(trialEndPreview('2026-10-01T12:00:00.000Z', 7, NOW)).toBe('28/10/2026');
    expect(trialEndPreview(null, 30, NOW)).toBe('20/11/2026');
  });

  it('confirmação pelo nome: sem diferença de maiúscula e de espaços; vazio nunca confere', () => {
    expect(storeNameMatches('  eletro   CENTER ', 'Eletro Center')).toBe(true);
    expect(storeNameMatches('Eletro', 'Eletro Center')).toBe(false);
    expect(storeNameMatches('', '')).toBe(false);
  });

  it('histórico Asaas: rótulo da ação e o aceite do termo', () => {
    expect(asaasAuditLabel('connect')).toBe('Conta conectada');
    expect(asaasAuditLabel('replace')).toBe('Chave trocada');
    expect(asaasAuditLabel('disconnect')).toBe('Conta desconectada');
    expect(asaasAuditLabel('outra')).toBe('Alteração na conta');
    expect(consentText(HIST.consent)).toBe('Termo 2026-09 aceito em 30/09/2026 às 09:00 · IP 200.1.2.3 · pelo lojista');
    expect(consentText({ ...HIST.consent, ip: null, actorRole: 'admin' })).toBe(
      'Termo 2026-09 aceito em 30/09/2026 às 09:00 · IP não registrado · assinado com o DROP',
    );
  });

  it('linha do tempo: os 4 tipos novos com rótulo; decisão de verificação e teste estendido com detalhe', () => {
    expect(actionLabel('verification_decision')).toBe('Decisão de verificação');
    expect(actionLabel('trial_extend')).toBe('Teste estendido');
    expect(actionLabel('saas_cancel')).toBe('Mensalidade cancelada');
    expect(actionLabel('plan_reject')).toBe('Troca de plano recusada');
    const base = { id: 't9', reason: null, createdAt: '2026-10-21T12:00:00.000Z', actor: { id: 'a1', name: 'Marina Rocha', role: 'ceo' } };
    expect(timelineDetail({
      ...base, type: 'verification_decision',
      meta: { decision: 'approve', subject: { kind: 'store', id: 's1' }, items: [{ kind: 'document', userId: 'l2', submittedAt: null }, { kind: 'cnpj', storeId: 's1', submittedAt: null }] },
    })).toBe('Aprovado: Documento, CNPJ');
    expect(timelineDetail({
      ...base, type: 'verification_decision',
      meta: { decision: 'reject', subject: { kind: 'client', id: 'c1' }, items: [{ kind: 'facial', userId: 'c1', submittedAt: null, reasonCode: 'face_mismatch', resend: true }] },
    })).toBe('Recusado: Selfie (Selfie não confere com o documento, pediu reenvio)');
    expect(timelineDetail({ ...base, type: 'verification_decision', meta: { decision: 'reject', items: 'x' } })).toBeNull();
    expect(timelineDetail({
      ...base, type: 'trial_extend',
      meta: { days: 14, from: '2030-11-01T12:00:00.000Z', to: '2030-11-15T12:00:00.000Z', nextDueDate: '2030-11-15', removedPayments: [] },
    })).toBe('+14 dias · até 15/11/2030');
    expect(timelineDetail({ ...base, type: 'trial_extend', meta: null })).toBeNull();
  });

  it('códigos novos em português; NOT_TRIALING e ALREADY_CANCELLED fazem a ficha reler', () => {
    expect(accountErrorMessage(http(409, { error: 'x', code: 'NOT_TRIALING' }))).toBe('A loja não está mais em teste. A ficha foi atualizada.');
    expect(accountErrorMessage(http(409, { error: 'x', code: 'ALREADY_CANCELLED' }))).toBe('A mensalidade já estava cancelada. A ficha foi atualizada.');
    expect(accountErrorMessage(http(409, { error: 'x', code: 'NO_SAAS_BILLING' }))).toBe('Esta loja não tem mensalidade para cancelar.');
    expect(accountErrorMessage(http(400, { error: 'x', code: 'INVALID_DAYS' }))).toBe('Escolha 7, 14 ou 30 dias.');
    expect(accountErrorMessage(http(502, { error: 'x', code: 'ASAAS_UPDATE_FAILED' }))).toBe(
      'O Asaas não aceitou a nova data da cobrança. Nada mudou: tente de novo em alguns minutos.',
    );
    expect(accountErrorMessage(http(502, { error: 'x', code: 'SAAS_CANCEL_FAILED' }))).toBe(
      'Não deu para cancelar a assinatura no Asaas. Nada mudou: tente de novo em alguns minutos.',
    );
    expect(isAccountConflict(http(409, { code: 'NOT_TRIALING' }))).toBe(true);
    expect(isAccountConflict(http(409, { code: 'ALREADY_CANCELLED' }))).toBe(true);
    expect(isAccountConflict(http(409, { code: 'NO_SAAS_BILLING' }))).toBe(false);
  });
});
