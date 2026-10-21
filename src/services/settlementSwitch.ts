import { prisma } from '../lib/prisma';
import env from '../config/env';
import { getSaasConfig, SettlementMode } from '../utils/settlement';

/**
 * Troca do modo de liquidação (SaaS "direto" ↔ app "custodia").
 *
 * A troca acontece uma vez só e decide para onde vai o dinheiro dos pedidos novos, então
 * é protegida: o CEO vê os riscos com os números reais e digita a frase exata. Os pedidos
 * já criados terminam no modo em que nasceram (Order.paymentProvider).
 */
export const CONFIRM_PHRASE: Record<SettlementMode, string> = {
  custodia: 'TROCAR PARA APP',
  direto: 'TROCAR PARA SAAS',
};

const IN_FLIGHT = ['criado', 'pago', 'aguardando_motoboy', 'enviado'] as const;

export interface SettlementPreview {
  from: SettlementMode;
  to: SettlementMode;
  confirmPhrase: string;
  blockers: string[];
  risks: string[];
  counts: Record<string, number>;
}

/** Repasse de custódia ainda não liquidado e saque em aberto (menu do admin no modo direto). */
export const OPEN_PAYOUT_STATUSES = ['pending', 'releasing', 'released', 'requested'] as const;
export const OPEN_WITHDRAWAL_STATUSES = ['pending', 'approved'] as const;

export async function countOpenCustody(): Promise<{ openPayouts: number; openWithdrawals: number }> {
  const [openPayouts, openWithdrawals] = await Promise.all([
    prisma.payout.count({ where: { status: { in: [...OPEN_PAYOUT_STATUSES] } } }),
    prisma.withdrawalRequest.count({ where: { status: { in: [...OPEN_WITHDRAWAL_STATUSES] } } }),
  ]);
  return { openPayouts, openWithdrawals };
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export async function settlementSwitchPreview(to: SettlementMode): Promise<SettlementPreview> {
  const { settlementMode: from, directTransfersEnabled } = await getSaasConfig();
  const blockers: string[] = [];
  const risks: string[] = [];

  const [directOrdersInFlight, custodyOrdersInFlight] = await Promise.all([
    prisma.order.count({ where: { status: { in: [...IN_FLIGHT] }, paymentProvider: 'asaas_loja' } }),
    prisma.order.count({ where: { status: { in: [...IN_FLIGHT] }, NOT: { paymentProvider: 'asaas_loja' } } }),
  ]);
  const counts: Record<string, number> = { directOrdersInFlight, custodyOrdersInFlight };

  if (to === 'custodia') {
    if (env.PAYMENT_GATEWAY !== 'asaas' || env.PAYOUT_GATEWAY !== 'asaas') {
      blockers.push(
        'PAYMENT_GATEWAY e PAYOUT_GATEWAY precisam estar em "asaas". Sem isso o modo app roda a carteira virtual antiga: pedido marcado como pago sem dinheiro de verdade.',
      );
    }
    const stores = await prisma.store.findMany({ select: { asaas: true } });
    const storesWithoutSubaccount = stores.filter((s) => !(s.asaas as any)?.walletId).length;
    counts.storesWithoutSubaccount = storesWithoutSubaccount;

    risks.push('Os pedidos novos passam a ser cobrados na conta da DROP (custódia). Isso exige CNPJ e subcontas Asaas aprovadas.');
    if (storesWithoutSubaccount > 0) {
      risks.push(
        `${storesWithoutSubaccount} loja(s) sem subconta de custódia: vendem, mas não conseguem sacar até completar o cadastro. O cadastro automático (Fase 5) ainda não existe.`,
      );
    }
    if (directOrdersInFlight > 0) {
      risks.push(`${directOrdersInFlight} pedido(s) do SaaS em andamento: terminam pela conta Asaas da própria loja.`);
    }
    risks.push('Planos e comissões voltam a valer para os pedidos novos.');
  } else {
    const [wallets, openPayouts, storesWithoutAccount] = await Promise.all([
      prisma.wallet.findMany({
        where: { OR: [{ balance: { gt: 0 } }, { blockedBalance: { gt: 0 } }] },
        select: { balance: true, blockedBalance: true },
      }),
      countOpenCustody().then((c) => c.openPayouts),
      prisma.store.count({ where: { OR: [{ asaasAccount: null }, { asaasAccount: { status: { not: 'valid' } } }] } }),
    ]);
    const custodyBalance = wallets.reduce((acc, w) => acc + Number(w.balance) + Number(w.blockedBalance), 0);
    Object.assign(counts, { walletsWithBalance: wallets.length, openPayouts, storesWithoutAccount });

    if (!directTransfersEnabled) {
      risks.push(
        'O Pix automático ao motoboy está desligado em Regras e taxas: os Pix ao motoboy ficam parados na fila e saem sozinhos quando ele for ligado, respeitando o teto diário da loja. Não pague à mão o que está na fila.',
      );
    }
    // settleDirectRefund pede e executa o estorno; o job directRefunds repete o que o Asaas recusou.
    risks.push(
      'Estorno que o Asaas recusar é tentado de novo sozinho; se esgotar as tentativas, fica para o admin em Estornos. Estorno sem resposta do Asaas (timeout, erro 5xx ou de rede) vai direto para o admin em Estornos.',
    );
    if (wallets.length > 0) {
      risks.push(
        `${wallets.length} carteira(s) com saldo de custódia (${brl(custodyBalance)}): no SaaS o dono continua vendo e sacando esse saldo (menu "Saldo do modo anterior") até zerar.`,
      );
    }
    if (openPayouts > 0) risks.push(`${openPayouts} repasse(s) de custódia em aberto: o admin precisa concluí-los em /admin/payouts.`);
    if (storesWithoutAccount > 0) {
      risks.push(`${storesWithoutAccount} loja(s) sem conta Asaas conectada: não conseguem vender até conectar.`);
    }
    if (custodyOrdersInFlight > 0) {
      risks.push(`${custodyOrdersInFlight} pedido(s) do app em andamento: terminam pela custódia.`);
    }
  }

  return { from, to, confirmPhrase: CONFIRM_PHRASE[to], blockers, risks, counts };
}
