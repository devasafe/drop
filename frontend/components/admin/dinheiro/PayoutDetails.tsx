/**
 * Detalhe de um repasse (mesmas linhas de buildPayoutDetails da página antiga, l. 356-435), com next/link
 * e sem estilo inline.
 */
import Link from 'next/link';
import ui from './Dinheiro.module.css';
import { isManualResolveId, payoutStatus, recipientName, type Payout } from './payoutRules';
import { formatMoney } from '../../../lib/money';

export interface PayoutInvoice { _id?: string; invoiceNumber?: string }

const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR');

export function PayoutDetails({ payout: p, invoice }: { payout: Payout; invoice: PayoutInvoice | null }) {
  const isStore = p.recipientType === 'store';
  return (
    <div className={ui.form}>
      <dl className={ui.detail}>
        <div><dt>Valor</dt><dd>{formatMoney(Number(p.amount))}</dd></div>
        <div><dt>Situação</dt><dd>{p.blocked ? 'Bloqueado' : payoutStatus(p).label}</dd></div>
      </dl>

      <h3 className={ui.fieldLabel}>Origem</h3>
      <dl className={ui.detail}>
        {p.order?.buyerName && (
          <div>
            <dt>Cliente</dt>
            <dd>{p.order.buyerId ? <Link href={`/user/${p.order.buyerId}`} className={ui.link}>{p.order.buyerName}</Link> : p.order.buyerName}</dd>
          </div>
        )}
        {p.order?.buyerEmail && <div><dt>E-mail do cliente</dt><dd>{p.order.buyerEmail}</dd></div>}
        <div>
          <dt>Pedido</dt>
          <dd><Link href={`/order/${p.orderId}`} className={ui.link}>{`#${String(p.orderId).slice(-6)}`}</Link></dd>
        </div>
        {p.order?.total != null && <div><dt>Total do pedido</dt><dd>{formatMoney(Number(p.order.total))}</dd></div>}
        {invoice?._id && (
          <div>
            <dt>Nota de serviço</dt>
            <dd><Link href={`/invoice/${invoice._id}`} className={ui.link}>{invoice.invoiceNumber || 'Ver nota'}</Link></dd>
          </div>
        )}
      </dl>

      <h3 className={ui.fieldLabel}>Destino</h3>
      <dl className={ui.detail}>
        <div><dt>Tipo</dt><dd>{isStore ? 'Loja' : 'Motoboy'}</dd></div>
        {p.recipient?.name ? (
          <>
            <div>
              <dt>{isStore ? 'Loja' : 'Motoboy'}</dt>
              <dd>
                <Link href={isStore ? `/stores/${p.recipient.id}` : `/user/${p.recipient.id}`} className={ui.link}>
                  {recipientName(p)}
                </Link>
              </dd>
            </div>
            {isStore && p.recipient.ownerName && p.recipient.ownerId && (
              <div><dt>Dono</dt><dd><Link href={`/user/${p.recipient.ownerId}`} className={ui.link}>{p.recipient.ownerName}</Link></dd></div>
            )}
            {isStore && p.recipient.ownerEmail && <div><dt>E-mail do dono</dt><dd>{p.recipient.ownerEmail}</dd></div>}
            {!isStore && p.recipient.email && <div><dt>E-mail</dt><dd>{p.recipient.email}</dd></div>}
          </>
        ) : (
          <div><dt>ID do recebedor</dt><dd className={ui.mono}>{p.recipientId}</dd></div>
        )}
      </dl>

      <h3 className={ui.fieldLabel}>Datas</h3>
      <dl className={ui.detail}>
        <div><dt>Criado em</dt><dd>{dateTime(p.createdAt)}</dd></div>
        {p.releasedAt && <div><dt>Liberado em</dt><dd>{dateTime(p.releasedAt)}</dd></div>}
        {p.paidAt && <div><dt>Pago em</dt><dd>{dateTime(p.paidAt)}</dd></div>}
        {p.uncertainAt && <div><dt>Incerto desde</dt><dd>{dateTime(p.uncertainAt)}</dd></div>}
        {p.resolvedAt && <div><dt>Resolvido em</dt><dd>{dateTime(p.resolvedAt)}</dd></div>}
        {p.resolutionNote && <div><dt>Nota da resolução</dt><dd>{p.resolutionNote}</dd></div>}
      </dl>

      {(p.gatewayProvider || p.gatewayTransferId) && (
        <>
          <h3 className={ui.fieldLabel}>Gateway</h3>
          <dl className={ui.detail}>
            {p.gatewayProvider && <div><dt>Provedor</dt><dd>{p.gatewayProvider}</dd></div>}
            {p.gatewayTransferId && (
              <div>
                <dt>ID da transferência</dt>
                {/* manual_resolve_* é o id sintético do "Resolver" sem nº informado: não é uma transferência do Asaas. */}
                {isManualResolveId(p.gatewayTransferId)
                  ? <dd>Resolvido à mão (sem nº do Asaas)</dd>
                  : <dd className={ui.mono}>{p.gatewayTransferId}</dd>}
              </div>
            )}
          </dl>
        </>
      )}

      {p.blocked && (
        <>
          <h3 className={ui.fieldLabel}>Bloqueio</h3>
          <dl className={ui.detail}><div><dt>Motivo</dt><dd>{p.blockReason || 'Sem motivo'}</dd></div></dl>
        </>
      )}

      <dl className={ui.detail}><div><dt>ID do repasse</dt><dd className={ui.mono}>{p._id}</dd></div></dl>
    </div>
  );
}

export default PayoutDetails;
