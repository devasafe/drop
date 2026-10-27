/**
 * D3b-1 · P1.4 — "Por que importa" (spec 3.2, decisões R1 e R2): cada motivo com relógio controlado,
 * os limites exatos ("há mais de" é estrito) e a precedência R1.
 */
import { attentionFor, AttentionInput, ATTENTION_ORDER } from '../services/adminOps/attention';

const NOW = new Date('2031-06-10T15:00:00.000Z'); // 10/06 12:00 em São Paulo
const LIMITS = { storeAcceptTimeoutMin: 10, poolTimeoutMin: 15 };
const ago = (m: number) => new Date(NOW.getTime() - m * 60_000);

const row = (over: Partial<AttentionInput> = {}): AttentionInput => ({
  status: 'aguardando_motoboy',
  paymentStatus: 'paid',
  createdAt: ago(60),
  paidAt: ago(59),
  acceptedAt: ago(55),
  cancelledAt: null,
  updatedAt: ago(1),
  awaitingCustomerPoolDecision: false,
  deliveryDuration: null,
  delivery: null,
  refundPending: false,
  ...over,
});
const delivery = (status: string, over: Partial<NonNullable<AttentionInput['delivery']>> = {}) => ({
  status, createdAt: ago(50), assignedAt: null, pickedAt: null, ...over,
});

it('ordem R1 dos motivos (sinal perdido, do antifraude, na frente)', () => {
  expect(ATTENTION_ORDER).toEqual(['sinal_perdido', 'estorno_pendente', 'loja_parada', 'cliente_decidindo', 'sem_motoboy', 'retirada_demorada', 'atrasado']);
});

it.each<[string, Partial<AttentionInput>, string | null]>([
  ['em andamento sem nada fora do prazo', {}, null],
  // loja_parada: prazo conta de paidAt (ou createdAt sem paidAt), só em criado/pago
  ['loja parada: pago há 11 min sem aceite', { status: 'pago', acceptedAt: null, paidAt: ago(11) }, 'loja_parada'],
  ['loja no limite: pago há 10 min exatos', { status: 'pago', acceptedAt: null, paidAt: ago(10) }, null],
  ['loja parada sem paidAt: criado há 11 min', { status: 'criado', acceptedAt: null, paidAt: null, createdAt: ago(11) }, 'loja_parada'],
  ['não pago não é loja parada', { status: 'criado', paymentStatus: 'pending', acceptedAt: null, paidAt: null, createdAt: ago(30) }, null],
  ['aguardando_motoboy sem aceite não é loja parada', { status: 'aguardando_motoboy', acceptedAt: null, paidAt: ago(30) }, null],
  // cliente_decidindo vence sem_motoboy (R1)
  ['cliente decidindo com pool vencido', { awaitingCustomerPoolDecision: true, delivery: delivery('pending', { createdAt: ago(40) }) }, 'cliente_decidindo'],
  ['loja parada vence cliente decidindo', { status: 'pago', acceptedAt: null, paidAt: ago(20), awaitingCustomerPoolDecision: true }, 'loja_parada'],
  // sem_motoboy
  ['pool há 16 min', { delivery: delivery('pending', { createdAt: ago(16) }) }, 'sem_motoboy'],
  ['pool há 15 min exatos', { delivery: delivery('pending', { createdAt: ago(15) }) }, null],
  // retirada_demorada
  ['atribuído há 21 min', { delivery: delivery('assigned', { assignedAt: ago(21) }) }, 'retirada_demorada'],
  ['atribuído há 20 min exatos', { delivery: delivery('assigned', { assignedAt: ago(20) }) }, null],
  // atrasado
  ['retirado há 46 min sem duração', { delivery: delivery('picked', { pickedAt: ago(46) }) }, 'atrasado'],
  ['retirado há 45 min exatos sem duração', { delivery: delivery('picked', { pickedAt: ago(45) }) }, null],
  ['rota de 10 min: atrasa depois de 25', { deliveryDuration: 600, delivery: delivery('picked', { pickedAt: ago(26) }) }, 'atrasado'],
  ['rota de 10 min: 24 min ainda no prazo', { deliveryDuration: 600, delivery: delivery('picked', { pickedAt: ago(24) }) }, null],
  // estorno_pendente: só cancelado hoje com estorno aberto
  ['cancelado hoje com estorno aberto', { status: 'cancelado', cancelledAt: ago(30), refundPending: true }, 'estorno_pendente'],
  ['rejeitado hoje com estorno aberto', { status: 'rejeitado', cancelledAt: ago(30), refundPending: true }, 'estorno_pendente'],
  ['cancelado hoje sem estorno aberto', { status: 'cancelado', cancelledAt: ago(30), refundPending: false }, null],
  ['cancelado ontem em SP com estorno aberto', { status: 'cancelado', cancelledAt: new Date('2031-06-10T02:59:00.000Z'), refundPending: true }, null],
  ['cancelado sem cancelledAt usa updatedAt de hoje', { status: 'cancelado', cancelledAt: null, updatedAt: ago(5), refundPending: true }, 'estorno_pendente'],
  ['cancelado com pool vencido não vira sem_motoboy', { status: 'cancelado', cancelledAt: ago(5), delivery: delivery('pending', { createdAt: ago(90) }) }, null],
  // entregue nunca
  ['entregue com retirada antiga', { status: 'entregue', delivery: delivery('picked', { pickedAt: ago(300) }) }, null],
])('%s', (_name, over, expected) => {
  expect(attentionFor(row(over), LIMITS, NOW)).toBe(expected);
});
