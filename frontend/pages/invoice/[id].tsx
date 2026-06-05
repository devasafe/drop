import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import api from '../../lib/api';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import styles from './Invoice.module.css';

interface DeliveryInvoice {
  _id: string;
  invoiceNumber: string;
  orderId: string;
  deliveryId: string;
  payoutId?: string;

  motoboyId: string;
  motoboyName: string;
  motoboyEmail?: string;
  motoboyCpf?: string;

  storeId: string;
  storeName: string;
  storeAddress?: string;
  storeCnpj?: string;

  customerId: string;
  customerName: string;
  customerAddress?: string;

  serviceDescription: string;
  distance?: number;
  deliveryFee: number;
  motoboyAmount: number;
  appCommission: number;
  commissionPercent: number;

  pickedAt?: string;
  deliveredAt?: string;
  issuedAt: string;
  status: 'issued' | 'cancelled';
  createdAt: string;
}

export default function InvoicePage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const [invoice, setInvoice] = useState<DeliveryInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetchInvoice = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/invoices/${id}`);
        setInvoice(res.data);
      } catch (err: any) {
        setError(err?.response?.data?.error || 'Erro ao carregar nota');
      } finally {
        setLoading(false);
      }
    };
    fetchInvoice();
  }, [id]);

  const fmt = (d?: string) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-';
  const fmtMoney = (v?: number) => `R$ ${(v ?? 0).toFixed(2)}`;

  if (loading) return <div className={styles.loadingScreen}><LoadingSkeleton variant="detail" /></div>;
  if (error || !invoice) return (
    <div className={styles.loadingScreen}>
      <p style={{ color: '#ef4444' }}>{error || 'Nota nao encontrada'}</p>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.container}>

        {/* Header da nota */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.badge}>NOTA DE SERVICO</div>
            <h1 className={styles.invoiceNumber}>{invoice.invoiceNumber}</h1>
            <p className={styles.issuedAt}>Emitida em {fmt(invoice.issuedAt)}</p>
          </div>
          <div className={styles.headerRight}>
            <span className={invoice.status === 'issued' ? styles.statusIssued : styles.statusCancelled}>
              {invoice.status === 'issued' ? 'Emitida' : 'Cancelada'}
            </span>
            <button onClick={() => window.print()} className={styles.printBtn}>Imprimir</button>
          </div>
        </div>

        {/* Prestador */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Prestador do Servico</div>
          <div className={styles.row}>
            <span className={styles.label}>Nome</span>
            <span
              className={styles.linkValue}
              onClick={() => router.push(`/user/${invoice.motoboyId}`)}
            >
              {invoice.motoboyName}
            </span>
          </div>
          {invoice.motoboyEmail && (
            <div className={styles.row}>
              <span className={styles.label}>Email</span>
              <span className={styles.value}>{invoice.motoboyEmail}</span>
            </div>
          )}
          {invoice.motoboyCpf && (
            <div className={styles.row}>
              <span className={styles.label}>CPF</span>
              <span className={styles.value}>{invoice.motoboyCpf}</span>
            </div>
          )}
          <div className={styles.row}>
            <span className={styles.label}>Atividade</span>
            <span className={styles.value}>Entregador autonomo (motoboy)</span>
          </div>
        </div>

        {/* Tomador */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Tomador do Servico</div>
          <div className={styles.row}>
            <span className={styles.label}>Loja</span>
            <span
              className={styles.linkValue}
              onClick={() => router.push(`/stores/${invoice.storeId}`)}
            >
              {invoice.storeName}
            </span>
          </div>
          {invoice.storeAddress && (
            <div className={styles.row}>
              <span className={styles.label}>Endereco</span>
              <span className={styles.value}>{invoice.storeAddress}</span>
            </div>
          )}
          {invoice.storeCnpj && (
            <div className={styles.row}>
              <span className={styles.label}>CNPJ</span>
              <span className={styles.value}>{invoice.storeCnpj}</span>
            </div>
          )}
        </div>

        {/* Destinatario */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Destinatario (Entrega)</div>
          <div className={styles.row}>
            <span className={styles.label}>Cliente</span>
            <span
              className={styles.linkValue}
              onClick={() => router.push(`/user/${invoice.customerId}`)}
            >
              {invoice.customerName}
            </span>
          </div>
          {invoice.customerAddress && (
            <div className={styles.row}>
              <span className={styles.label}>Endereco</span>
              <span className={styles.value}>{invoice.customerAddress}</span>
            </div>
          )}
        </div>

        {/* Discriminacao do servico */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Discriminacao do Servico</div>
          <div className={styles.serviceDesc}>{invoice.serviceDescription}</div>
          <div className={styles.row}>
            <span className={styles.label}>Pedido</span>
            <span
              className={styles.linkValue}
              onClick={() => router.push(`/order/${invoice.orderId}`)}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            >
              #{invoice.orderId.slice(-8)}
            </span>
          </div>
          {invoice.distance != null && (
            <div className={styles.row}>
              <span className={styles.label}>Distancia</span>
              <span className={styles.value}>{invoice.distance.toFixed(1)} km</span>
            </div>
          )}
          <div className={styles.row}>
            <span className={styles.label}>Retirada</span>
            <span className={styles.value}>{fmt(invoice.pickedAt)}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Entrega</span>
            <span className={styles.value}>{fmt(invoice.deliveredAt)}</span>
          </div>
        </div>

        {/* Valores */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Valores</div>
          <div className={styles.row}>
            <span className={styles.label}>Taxa de Entrega (Bruto)</span>
            <span className={styles.value}>{fmtMoney(invoice.deliveryFee)}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Comissao da Plataforma</span>
            <span className={styles.value}>
              {fmtMoney(invoice.appCommission)} ({invoice.commissionPercent}%)
            </span>
          </div>
          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>Liquido Motoboy</span>
            <span className={styles.totalValue}>{fmtMoney(invoice.motoboyAmount)}</span>
          </div>
        </div>

        <div className={styles.footerNote}>
          Documento gerado automaticamente pela plataforma DROP. Este documento nao substitui
          nota fiscal de servico eletronica (NFS-e). Emissao fiscal oficial depende de cadastro
          do prestador como autonomo ou MEI e esta em fase de implementacao.
        </div>
      </div>
    </div>
  );
}
