import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Camera } from 'lucide-react';
import api from '../../../lib/api';
import ProtectedRoute from '../../../components/ProtectedRoute';
import { ScreenHeader } from '../../../components/drop/ScreenHeader';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { RadioRow } from '../../../components/ui/RadioRow';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/Toast';
import { formatMoney } from '../../../lib/money';
import { shortOrderCode } from '../../../lib/customerOrder';
import { ROUTES, pedidoHref } from '../../../lib/routes';
import styles from '../Reembolso.module.css';

type Reason = 'defeito' | 'errado' | 'arrependimento';

const REASONS: { key: Reason; label: string; description: string }[] = [
  { key: 'defeito', label: 'Veio com defeito', description: 'Não funciona ou chegou quebrado' },
  { key: 'errado', label: 'Veio diferente do pedido', description: 'Outro modelo, cor ou tamanho' },
  { key: 'arrependimento', label: 'Me arrependi', description: 'Não quero mais o produto' },
];

/**
 * Pedir reembolso de um pedido entregue (DS v2, caso B): motivo, comentário e foto opcionais e o
 * valor que volta, calculado pelo servidor (GET …/return-request/preview). A loja aprova; o dinheiro
 * só sai quando ela receber o produto e digitar o código.
 */
export default function PedirReembolsoPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : undefined;
  const { showToast } = useToast();
  const [order, setOrder] = useState<any | null>(null);
  const [amounts, setAmounts] = useState<Record<Reason, number> | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [reason, setReason] = useState<Reason>('defeito');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!id) return;
    let off = false;
    api.get(`/orders/${id}`).then((r) => { if (!off) setOrder(r.data); }).catch(() => undefined);
    api.get(`/orders/${id}/return-request/preview`)
      .then((r) => { if (!off) setAmounts(r.data?.amounts ?? null); })
      .catch((e) => { if (!off) setBlocked(e?.response?.data?.error || 'Não deu para abrir o reembolso agora. Tente de novo.'); });
    return () => { off = true; };
  }, [id]);

  const submit = async () => {
    if (!id || sending) return;
    setSending(true);
    const body = new FormData();
    body.append('reason', reason);
    if (note.trim()) body.append('note', note.trim());
    if (photo) body.append('photo', photo);
    try {
      await api.post(`/orders/${id}/return-request`, body);
      showToast('Pedido de reembolso enviado à loja', 'success');
      router.replace(pedidoHref(id));
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Não deu para enviar agora. Tente de novo.', 'error');
      setSending(false);
    }
  };

  const amount = amounts?.[reason];
  const full = amount != null && order && amount >= (Number(order.totalValue) || 0);
  const item = order?.products?.[0];

  return (
    <ProtectedRoute required_role="cliente">
      <main className={styles.page}>
        <ScreenHeader title="Pedir reembolso" onBack={() => router.push(id ? pedidoHref(id) : ROUTES.pedidos)} meta={id ? `#${shortOrderCode(id)}` : undefined} />
        <div className={styles.body}>
          {blocked ? (
            <Alert tone="info" title={blocked} action={{ label: 'Falar com o suporte', onClick: () => router.push(ROUTES.ajuda) }} />
          ) : (
            <>
              {item ? (
                <section className={styles.card}>
                  <span className={styles.itemName}>{item.productName}</span>
                  <span className={styles.meta}>{`${order.storeName || 'Loja'}${order.products.length > 1 ? ` · +${order.products.length - 1} ${order.products.length === 2 ? 'item' : 'itens'}` : ''}`}</span>
                </section>
              ) : (
                <Skeleton height={56} />
              )}

              <section className={styles.card}>
                <h2 className={styles.title}>O que aconteceu?</h2>
                <div className={styles.choices} role="radiogroup" aria-label="Motivo do reembolso">
                  {REASONS.map((r) => (
                    <RadioRow key={r.key} name="motivo-reembolso" value={r.key} checked={reason === r.key} onChange={() => setReason(r.key)} label={r.label} description={r.description} />
                  ))}
                </div>
              </section>

              <section className={styles.card}>
                <label htmlFor="reembolso-nota" className={styles.label}>Conte o que aconteceu (opcional)</label>
                <textarea id="reembolso-nota" className={styles.textarea} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                <label className={styles.photo}>
                  <Camera size={20} aria-hidden="true" />
                  <span>{photo ? photo.name : 'Adicionar foto'}</span>
                  <input type="file" accept="image/*" className={styles.file} onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                </label>
                <span className={styles.meta}>A foto ajuda a loja a aprovar mais rápido.</span>
              </section>

              {amount != null && (
                full ? (
                  <Alert tone="info" title={`Volta tudo: ${formatMoney(amount)}`}>
                    O valor inteiro, com a entrega. O dinheiro volta quando a loja receber o produto.
                  </Alert>
                ) : (
                  <Alert tone="info" title={`Volta ${formatMoney(amount)}`}>
                    Sem a taxa de entrega: passaram 7 dias da entrega e a entrega já foi feita. O dinheiro volta quando a loja receber o produto.
                  </Alert>
                )
              )}
            </>
          )}
        </div>
        {!blocked && (
          <div className={styles.bar}>
            <Button onClick={submit} loading={sending}>Enviar pedido à loja</Button>
          </div>
        )}
      </main>
    </ProtectedRoute>
  );
}
