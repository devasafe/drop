import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { notifyUser } from './storeNotify';
import { sendEmail } from './emailProvider';

/**
 * Avisos ao CLIENTE em cada etapa do pedido (pendência da reunião de 23/10/2026).
 * Sino + socket + push em todas as etapas (notifyUser); e-mail só nas que envolvem dinheiro
 * ou desfecho (pago, entregue, cancelado, estorno concluído), para não virar spam e caber no
 * limite diário do Brevo. Best-effort: nunca lança — quem chama já gravou a mudança do pedido.
 */

export const CUSTOMER_LINKS = {
  order: (orderId: string) => `/pedido/${orderId}`,
} as const;

export type CustomerStage =
  | 'paid' | 'accepted' | 'motoboy_assigned' | 'picked' | 'delivered'
  | 'cancelled' | 'refunded' | 'pix_expired'
  | 'searching_motoboy' | 'pool_timeout' | 'return_decision';

export interface CustomerNoticeExtra {
  /**
   * Código do motivo do cancelamento. Vira uma frase fixa: o texto livre digitado pela loja ou pelo
   * motoboy NUNCA vai para o aviso nem para o e-mail do DROP (poderia levar link, chave Pix ou telefone).
   */
  reasonCode?: string | null;
  /** Valor devolvido no cancelamento/estorno; sem ele, vale o total do pedido (0 = nada a devolver). */
  refundAmount?: number | null;
  /** Cancelado pelo suporte: o aviso não cita loja nem motivo (a culpa não aparece para o cliente). */
  byAdmin?: boolean;
}

/** Endereço público do site (links do e-mail): PUBLIC_SITE_URL, senão o 1º https do CORS_ORIGIN. */
export function siteUrl(): string {
  const explicit = (process.env.PUBLIC_SITE_URL || '').trim();
  const fromCors = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).find((s) => s.startsWith('https://'));
  return (explicit || fromCors || 'https://dropapp.com.br').replace(/\/+$/, '');
}

/** Frase fixa por código de motivo (CancellationReasonCode). Código sem frase: o aviso sai sem motivo. */
const CANCEL_REASON_TEXT: Record<string, string> = {
  customer_request: 'a pedido seu',
  not_available: 'produto indisponível na loja',
  store_closed: 'a loja estava fechada',
  store_busy: 'a loja não conseguiu atender agora',
  motoboy_unavailable: 'nenhum motoboy disponível',
  delivery_failed: 'a entrega não pôde ser concluída',
  customer_unreachable: 'não conseguimos falar com você na entrega',
  address_invalid: 'problema com o endereço de entrega',
  payment_issue: 'problema com o pagamento',
  wrong_order: 'pedido com erro',
  damaged_items: 'produto danificado',
  store_rejected: 'a loja não pôde aceitar o pedido',
  late_cancellation: 'a pedido seu',
};

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

interface OrderFacts { id: string; store: string; total: number; paid: boolean }

interface Notice {
  title: string;
  message: string;
  /** Etapas que webhook, conciliação ou dois caminhos de cancelamento repetem: avisa uma vez. */
  dedupe: boolean;
  email: boolean;
}

function buildNotice(stage: CustomerStage, o: OrderFacts, extra: CustomerNoticeExtra): Notice {
  const refund = extra.refundAmount != null && Number.isFinite(Number(extra.refundAmount)) ? Number(extra.refundAmount) : o.total;
  switch (stage) {
    case 'paid':
      return { title: 'Pagamento confirmado', message: `Seu pedido de ${brl(o.total)} na ${o.store} foi pago. Agora é só aguardar a loja aceitar.`, dedupe: true, email: true };
    case 'accepted':
      return { title: 'Pedido aceito', message: `A ${o.store} aceitou seu pedido e está preparando.`, dedupe: true, email: false };
    case 'motoboy_assigned':
      return { title: 'Motoboy a caminho da loja', message: `Um motoboy aceitou sua entrega e vai buscar seu pedido na ${o.store}.`, dedupe: false, email: false };
    case 'picked':
      return { title: 'Saiu para entrega', message: `Seu pedido saiu da ${o.store} e está a caminho. Tenha em mãos o código de entrega que aparece no app.`, dedupe: false, email: false };
    case 'delivered':
      return { title: 'Pedido entregue', message: `Seu pedido da ${o.store} foi entregue. Toque para avaliar.`, dedupe: true, email: true };
    case 'cancelled': {
      const money = o.paid && refund > 0 ? ` Vamos devolver ${brl(refund)}.` : '';
      if (extra.byAdmin) return { title: 'Pedido cancelado', message: `O suporte do DROP cancelou o seu pedido #${o.id.slice(-6)}.${money}`, dedupe: true, email: true };
      const reasonText = extra.reasonCode ? CANCEL_REASON_TEXT[String(extra.reasonCode)] : undefined;
      const why = reasonText ? ` (${reasonText})` : '';
      return { title: 'Pedido cancelado', message: `Seu pedido na ${o.store} foi cancelado${why}.${money}`, dedupe: true, email: true };
    }
    case 'refunded':
      return { title: 'Estorno concluído', message: `O estorno de ${brl(refund)} do seu pedido na ${o.store} foi concluído.`, dedupe: true, email: true };
    case 'pix_expired':
      return { title: 'Pagamento não identificado', message: `O Pix do seu pedido na ${o.store} expirou e o pedido foi cancelado. Nenhum valor foi cobrado.`, dedupe: true, email: false };
    case 'searching_motoboy':
      return { title: 'Procurando outro motoboy', message: 'O motoboy anterior não pôde seguir com a entrega. Já estamos procurando outro.', dedupe: false, email: false };
    case 'pool_timeout':
      return { title: 'Nenhum motoboy disponível', message: 'Ainda não encontramos motoboy para o seu pedido. Toque para escolher entre esperar mais ou cancelar.', dedupe: false, email: false };
    case 'return_decision':
      return { title: 'Escolha o que fazer com seu pedido', message: 'O motoboy não conseguiu concluir a entrega. Toque para escolher entre reembolso e nova entrega.', dedupe: false, email: false };
  }
}

function emailHtml(n: Notice, link: string): string {
  return `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;line-height:1.5">`
    + `<h2 style="margin:0 0 12px">${escapeHtml(n.title)}</h2>`
    + `<p style="margin:0 0 20px">${escapeHtml(n.message)}</p>`
    + `<p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Ver pedido</a></p>`
    + `<p style="margin:0;color:#666;font-size:13px">DROP</p></div>`;
}

export async function notifyCustomerOrder(orderId: string | null | undefined, stage: CustomerStage, extra: CustomerNoticeExtra = {}): Promise<void> {
  if (!orderId) return;
  try {
    const order = await prisma.order.findUnique({
      where: { id: String(orderId) },
      select: {
        id: true, customerId: true, totalValue: true, paymentStatus: true, paidAt: true,
        store: { select: { name: true } }, customer: { select: { email: true } },
      },
    });
    if (!order?.customerId) return;

    const facts: OrderFacts = {
      id: order.id,
      store: order.store?.name || 'loja',
      total: Number(order.totalValue) || 0,
      paid: order.paymentStatus === 'paid' || order.paymentStatus === 'refunded' || !!order.paidAt,
    };
    const n = buildNotice(stage, facts, extra);
    const link = CUSTOMER_LINKS.order(order.id);

    if (n.dedupe) {
      const dup = await prisma.notification.findFirst({ where: { userId: order.customerId, entityId: order.id, title: n.title }, select: { id: true } });
      if (dup) return;
    }

    await notifyUser(order.customerId, { title: n.title, message: n.message, link, entityId: order.id, type: 'order', tag: `pedido-${order.id}` });

    if (n.email && order.customer?.email) {
      try {
        await sendEmail(order.customer.email, `${n.title} — DROP`, emailHtml(n, `${siteUrl()}${link}`));
      } catch (err) {
        logger.warn('[customerNotify] e-mail ao cliente falhou', { orderId: order.id, stage, errName: (err as Error)?.name });
      }
    }
  } catch (err) {
    logger.warn('[customerNotify] falha ao avisar o cliente', { orderId: String(orderId), stage, errName: (err as Error)?.name });
  }
}
