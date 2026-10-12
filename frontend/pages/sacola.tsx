import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ShieldCheck, ShoppingBag, XCircle } from 'lucide-react';
import ProtectedRoute from '../components/ProtectedRoute';
import { useCheckout } from '../hooks/useCheckout';
import { useSaasConfig } from '../hooks/useSaasConfig';
import { useCart } from '../contexts/CartContext';
import { useToast } from '../components/ui/Toast';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { RadioRow } from '../components/ui/RadioRow';
import { Input } from '../components/ui/Input';
import { ScreenHeader } from '../components/drop/ScreenHeader';
import { CartItem } from '../components/drop/CartItem';
import { OrderSummary, type SummaryLine } from '../components/drop/OrderSummary';
import { DeliveryBadge } from '../components/drop/DeliveryBadge';
import { AddressPickerSheet } from '../components/drop/AddressPickerSheet';
import { AddressSheet } from '../components/drop/checkout/AddressSheet';
import { PaymentSelector } from '../components/drop/checkout/PaymentSelector';
import { CardForm } from '../components/drop/checkout/CardForm';
import { WalletToggle } from '../components/drop/checkout/WalletToggle';
import { CouponField } from '../components/drop/checkout/CouponField';
import { CheckoutBar } from '../components/drop/checkout/CheckoutBar';
import { InstallmentList } from '../components/drop/checkout/InstallmentList';
import { PixPaymentSheet } from '../components/drop/checkout/PixPaymentSheet';
import { readDeliveryAddressId, saveDeliveryAddressId, addressId, shortAddress } from '../hooks/useDeliveryAddress';
import { formatMoney } from '../lib/money';
import { maskCPF, onlyDigits } from '../lib/masks';
import { isValidCPF } from '../lib/cpf';
import { maskCpfMiddle } from '../lib/maskCpf';
import { imageUrl } from '../lib/config';
import { installmentOptions } from '../lib/cardInstallments';
import { markJustPaid } from '../lib/justPaid';
import { ROUTES, buscarHref, lojaHref, pedidoHref } from '../lib/routes';
import styles from './Sacola.module.css';

const STORE_NO_LOCATION_MSG = 'Esta loja ainda não configurou a localização.';
const PAUSE_MESSAGES: Record<string, string> = {
  PRODUCT_PAUSED: 'Este produto foi pausado pela loja',
  STORE_PAUSED: 'A loja pausou os pedidos agora',
};
const STORE_UNAVAILABLE_CODES = ['STORE_BILLING_PAUSED', 'STORE_PAYMENTS_NOT_READY'];
const STORE_GONE_MSG = 'Esta loja não está mais disponível';
const STORE_LOOKUP_FAILED_MSG = 'Não deu para carregar a loja';

export default function SacolaPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const cart = useCart() || ({} as any);
  const c = useCheckout();
  const { settlementMode, directCardEnabled } = useSaasConfig();
  const direct = settlementMode === 'direto';
  const directMethods: ('pix' | 'credit_card')[] = directCardEnabled ? ['pix', 'credit_card'] : ['pix'];
  // Ruling F-I4: sem "pagar só com saldo" (método wallet). Com o gateway Asaas o servidor recusa
  // tudo que não é pix/credit_card com 400, e o front não tem sinal confiável do gateway: fail
  // closed. O saldo continua pelo toggle "Usar saldo" no Pix (que cobre até 100% do total).
  const methods: ('pix' | 'credit_card')[] = direct ? directMethods : ['pix', 'credit_card'];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [pixAmount, setPixAmount] = useState<number | undefined>(undefined);
  // Modo direto: a loja pausou (ou perdeu a conta de recebimento) com a sacola aberta.
  const [unavailable, setUnavailable] = useState(false);
  // A barra de pagar é fixa na viewport no mobile; o PageTransition quebra position:fixed,
  // então no mobile ela vai por portal ao body (só depois da hidratação). No desktop fica inline.
  const [barMode, setBarMode] = useState<'ssr' | 'mobile' | 'desktop'>('ssr');
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') { setBarMode('mobile'); return; }
    const mq = window.matchMedia('(min-width: 900px)');
    const update = () => setBarMode(mq.matches ? 'desktop' : 'mobile');
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  // Rascunho antigo pode ter método que não é oferecido (modo direto sem cartão, ou o antigo
  // "wallet"): volta para o Pix, para a Sacola nunca ficar sem chip selecionado.
  useEffect(() => {
    if (!methods.includes(c.paymentMethod as any)) c.setPaymentMethod('pix');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direct, directCardEnabled, c.paymentMethod]);

  // O endereço escolhido no app (Home/Buscar) vale aqui também.
  useEffect(() => {
    const id = readDeliveryAddressId();
    if (!id || c.address.loading) return;
    const idx = (c.address.addresses || []).findIndex((a: any) => addressId(a) === id);
    if (idx >= 0 && addressId(c.address.selected || {}) !== id) c.address.selectAddress(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.address.loading, (c.address.addresses || []).length]);

  const items = (c.items || []) as any[];
  const count = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  // I4: loja que saiu do GET /stores antes de abrir a Sacola (pausada → resumo com o nome; sumiu).
  const storeGone = c.storeGone ?? null;
  const storePaused = unavailable || storeGone?.reason === 'unavailable';
  const storeName = c.store?.name || (storeGone?.reason === 'unavailable' ? storeGone.name : undefined) || 'Loja';
  // Valor do Pix: total menos o saldo da carteira (se ligado). O atalho "Pagar com Pix" do cartão mostra este valor.
  const pixWalletUse = c.useWallet ? Math.min(c.walletBalance || 0, c.total) : 0;
  const pixToPay = Math.max(0, Math.round((c.total - pixWalletUse) * 100) / 100);
  const walletUse = c.paymentMethod === 'pix' ? pixWalletUse : 0;
  const isCard = c.paymentMethod === 'credit_card';
  // Parcelas: espelho de computeCardTotal/installmentOptions (o servidor recalcula a cobrança).
  const cardOpts = isCard && c.config ? installmentOptions(c.total, {
    cardFeePercent: c.config.cardFeePercent ?? 2.99, cardFeeFixed: c.config.cardFeeFixed ?? 0.49,
    cardAnticipationMonthlyRate: c.config.cardAnticipationMonthlyRate ?? 1.99,
    cardInstallmentMaxCount: c.config.cardInstallmentMaxCount ?? 12, cardInstallmentMinValue: c.config.cardInstallmentMinValue ?? 5,
  }) : [];
  const chosen = cardOpts.find((o) => o.count === c.installmentCount) ?? cardOpts[0];
  // M1: a parcela enviada é a mostrada. Se a escolhida saiu das opções (a sacola encolheu e a
  // parcela ficou abaixo do mínimo), a escolha acompanha a opção exibida.
  const chosenCount = chosen?.count;
  useEffect(() => {
    if (isCard && chosenCount != null && chosenCount !== c.installmentCount) c.setInstallmentCount(chosenCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCard, chosenCount, c.installmentCount]);
  const toPay = isCard && chosen ? chosen.total : pixToPay;
  const cardInvalid = c.paymentMethod === 'credit_card' && !c.cardPayload?.valid;
  const cpfBad = c.cpfRequired && !isValidCPF(c.cpf);
  // P11: sem endereço não se paga, nem no Plano 1 (o hook libera o Plano 1 sem cotação;
  // nos demais planos a cotação já exige o endereço).
  const canPlace = c.canPlace && (!c.isPlan1 || !!c.address.selected);

  const hint = storePaused ? 'A loja não está recebendo pedidos agora'
    : storeGone?.reason === 'gone' ? STORE_GONE_MSG
    : c.storeLookupFailed ? STORE_LOOKUP_FAILED_MSG
    : !canPlace && !c.address.selected ? 'Adicione um endereço de entrega'
    : c.storeOpen === false ? 'A loja está fechada agora'
    : c.outOfArea ? 'Esta loja não entrega nesse endereço'
    : c.deliveryIssue === 'STORE_NO_LOCATION' ? STORE_NO_LOCATION_MSG
    : c.deliveryIssue === 'NO_ADDRESS' ? 'Confirme o endereço no mapa'
    : !canPlace ? (c.quoteError ?? 'Calculando entrega…')
    : c.isWalletInsufficient ? 'Saldo insuficiente'
    : cardInvalid ? 'Preencha os dados do cartão'
    : cpfBad ? (onlyDigits(c.cpf).length === 11 ? 'CPF inválido' : 'Informe seu CPF')
    : undefined;

  const payLabel = isCard ? (chosen && chosen.count > 1 ? `Pagar ${chosen.count}x de ${formatMoney(chosen.installmentValue)}` : `Pagar ${formatMoney(chosen?.total ?? c.total)} no cartão`)
    : toPay === 0 && walletUse > 0 ? 'Pagar com o saldo da carteira'
    : `Pagar ${formatMoney(toPay)} com Pix`;

  const lines: SummaryLine[] = [
    { label: `Subtotal (${count} ${count === 1 ? 'item' : 'itens'})`, value: c.subtotal },
    c.isPlan1
      ? { label: 'Entrega pela loja', value: 0, freeLabel: 'Grátis' }
      : { label: c.distanceKm > 0 ? `Entrega · ${String(c.distanceKm).replace('.', ',')} km` : 'Entrega', value: c.deliveryFee, freeLabel: 'Grátis' },
    ...(c.discount > 0 ? [{ label: `Cupom ${c.coupon.code.toUpperCase()}`, value: -c.discount, tone: 'credit' as const }] : []),
    ...(isCard && chosen ? [{ label: chosen.count === 1 ? 'Acréscimo do cartão (à vista)' : `Acréscimo do cartão ${chosen.count}x`, value: Math.round((chosen.total - c.total) * 100) / 100 }] : []),
    ...(walletUse > 0 ? [{ label: 'Saldo da carteira', value: -walletUse, tone: 'credit' as const }] : []),
  ];

  const changeQty = (item: any) => (q: number) => {
    if (q > 0) { c.updateQuantity(item.productId, q); return; }
    c.removeItem(item.productId);
    showToast('Item removido', 'info', { action: { label: 'Desfazer', onClick: () => cart.add?.({ ...item, quantity: item.quantity }) } });
  };

  const pay = async () => {
    setPixAmount(toPay); // o carrinho é limpo ao criar o pedido: guarda o valor a pagar antes
    const r = await c.placeOrder();
    if (!r.ok && r.code && STORE_UNAVAILABLE_CODES.includes(r.code)) { setUnavailable(true); return; }
    if (!r.ok && r.code && PAUSE_MESSAGES[r.code]) { showToast(PAUSE_MESSAGES[r.code], 'error'); return; }
    if (!r.ok && r.error) showToast(r.error, 'error');
  };

  const cpfShown = c.cpfRequired && isValidCPF(c.cpf) ? maskCpfMiddle(c.cpf) : '';
  const vitrineNote = c.isPlan1 && !direct ? 'O dinheiro só vai para a loja quando você confirmar que recebeu.' : null;
  const note = cpfShown ? `CPF ${cpfShown} · ao pagar, você aceita os termos` : 'Ao pagar, você concorda com os termos de uso.';
  const fmtKm = (n: number) => `${String(n).replace('.', ',')} km`;
  const deliveryTail = !c.isPlan1 && c.distanceKm > 0 ? `${fmtKm(c.distanceKm)} · ${c.deliveryFee > 0 ? formatMoney(c.deliveryFee) : 'Grátis'}` : null;

  const payBar = (inline: boolean) => (
    <CheckoutBar total={toPay} showTotal={false} label={payLabel} note={vitrineNote ?? note} inline={inline}
      disabled={!!hint || c.placing} loading={c.placing} hint={hint} onConfirm={pay}
      // M5: com o saldo cobrindo tudo não há Pix a pagar — o atalho some (nunca "R$ 0,00").
      secondary={isCard && pixToPay > 0 ? { label: `Pagar com Pix por ${formatMoney(pixToPay)}`, onClick: () => c.setPaymentMethod('pix') } : undefined} />
  );

  return (
    <ProtectedRoute required_role="cliente">
      {c.blocked ? (
        <EmptyState icon={<XCircle />} title="Compras bloqueadas" description="Sua conta não está no modo Cliente. Troque o modo no menu da conta para comprar." />
      ) : c.address.loading ? (
        <div className={styles.page}><Skeleton height={120} /><Skeleton height={160} /><Skeleton height={140} /></div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <EmptyState icon={<ShoppingBag />} title="Sua sacola está vazia" description="Adicione produtos de uma loja para pedir."
            action={<Button onClick={() => router.push(ROUTES.inicio)}>Explorar lojas</Button>} />
        </div>
      ) : (
        <main className={styles.page}>
          <ScreenHeader title="Sacola" meta={direct ? storeName : undefined} onBack={() => router.back()} />
          <div className={styles.cols}>
          <div className={styles.mainCol}>

          <section className={styles.block} aria-labelledby="sacola-loja">
            <div className={styles.blockHeader}>
              <h2 id="sacola-loja" className={styles.blockTitle}>{storeName}</h2>
              {c.isPlan1 && <Badge tone="status">Vitrine</Badge>}
              {c.store?._id && <Link href={lojaHref(c.store._id)} className={styles.link}>Adicionar mais</Link>}
            </div>
            {storePaused && (
              <Alert tone="warning" title={`A ${storeName} não está recebendo pedidos agora`}>Sua sacola fica guardada. Tente de novo mais tarde.</Alert>
            )}
            {!storePaused && storeGone?.reason === 'gone' && (
              <Alert tone="warning" title={STORE_GONE_MSG} action={{ label: 'Ver outras lojas', onClick: () => router.push(ROUTES.inicio) }}>
                Os itens desta sacola não podem mais ser pedidos.
              </Alert>
            )}
            {!storePaused && !storeGone && c.storeLookupFailed && (
              <Alert tone="error" title={STORE_LOOKUP_FAILED_MSG} action={{ label: 'Tentar de novo', onClick: c.retryStoreLookup }}>
                Sem os dados da loja não dá para calcular a entrega.
              </Alert>
            )}
            <div aria-live="polite">
              {items.map((i) => (
                <CartItem key={i.productId} item={{ name: i.name || 'Produto', price: Number(i.price) || 0, quantity: i.quantity, imageUrl: imageUrl(i.image) || null }} onQuantityChange={changeQty(i)} />
              ))}
            </div>
          </section>

          <section className={styles.block} aria-labelledby="sacola-entrega">
            <div className={styles.blockHeader}>
              <h2 id="sacola-entrega" className={styles.blockTitle}>{c.isPlan1 ? 'Entregar em' : 'Entrega'}</h2>
              {c.address.selected && <button type="button" className={styles.link} onClick={() => setPickerOpen(true)}>Trocar</button>}
            </div>
            {c.isPlan1 && (
              <Alert tone="info" title="A loja mesma entrega">Lojas vitrine não usam motoboy da DROP. Depois de pagar, você combina dia e hora com a loja pelo chat. Sem taxa de entrega.</Alert>
            )}
            {c.address.selected ? (
              <p className={styles.address}>{[shortAddress(c.address.selected), c.address.selected.complement].filter(Boolean).join(' · ')}</p>
            ) : (
              <Button variant="secondary" onClick={() => setPickerOpen(true)}>Adicionar endereço</Button>
            )}
            {c.isPlan1 && c.address.selected && c.distanceKm > 0 && (
              <p className={styles.muted}>{`A loja fica a ${fmtKm(c.distanceKm)}`}</p>
            )}
            {!c.isPlan1 && c.address.selected && !c.outOfArea && c.storeOpen !== false && (
              c.quoteLoading ? <DeliveryBadge state={{ kind: 'loading' }} />
                : c.etaMinutes ? (
                  <div className={styles.etaLine}>
                    <DeliveryBadge state={{ kind: 'fast', minutes: c.etaMinutes[1] }} />
                    {deliveryTail && <span className={styles.etaTail}>{deliveryTail}</span>}
                  </div>
                ) : null
            )}
            {c.outOfArea && (
              <Alert tone="error" title={`${storeName} não entrega neste endereço`} action={{ label: 'Trocar endereço', onClick: () => setPickerOpen(true) }}>
                Escolha outro endereço ou outra loja perto de você.
              </Alert>
            )}
            {c.deliveryIssue === 'STORE_NO_LOCATION' && (
              <Alert tone="warning" title={STORE_NO_LOCATION_MSG}>Ainda não dá para calcular a entrega dela. Tente outra loja por enquanto.</Alert>
            )}
            {c.deliveryIssue === 'NO_ADDRESS' && (
              <Alert tone="warning" title="Confirme o endereço no mapa" action={{ label: 'Trocar endereço', onClick: () => setPickerOpen(true) }}>
                Este endereço está sem localização no mapa. Escolha outro ou cadastre de novo.
              </Alert>
            )}
            {c.quoteError && (
              <Alert tone="warning" title={c.quoteError} action={{ label: 'Tentar de novo', onClick: c.retryQuote }}>
                Seu pedido não foi enviado.
              </Alert>
            )}
            {c.storeOpen === false && (
              <Alert tone="warning" title="Loja fechada agora">{c.opensAt ? `Abre às ${c.opensAt}. ` : ''}Sua sacola fica guardada até lá.</Alert>
            )}
          </section>

          <section className={styles.block} aria-labelledby="sacola-pagamento">
            <h2 id="sacola-pagamento" className={styles.blockTitle}>Pagamento</h2>
            {direct && !directCardEnabled ? (
              <div role="radiogroup" aria-label="Forma de pagamento" className={styles.methodRows}>
                <RadioRow name="pagamento" value="pix" checked onChange={() => c.setPaymentMethod('pix')} label="Pix" description="Aprovação na hora" />
                <RadioRow name="pagamento" value="credit_card" checked={false} onChange={() => {}} label="Cartão" description="Esta loja ainda não aceita cartão" disabled />
              </div>
            ) : (
              <>
                <PaymentSelector value={c.paymentMethod} onChange={c.setPaymentMethod}
                  methods={methods} />
                <p className={styles.methodNote}>{isCard ? 'Em até 12x' : 'Aprovação na hora'}</p>
              </>
            )}
            {c.paymentMethod === 'credit_card' && (
              <div className={styles.card}>
                <CardForm onChange={c.setCardPayload} holderDefaults={c.cardHolderDefaults} />
                {c.config && (
                  <InstallmentList options={cardOpts} base={c.total} value={chosen?.count ?? c.installmentCount} onChange={c.setInstallmentCount} />
                )}
              </div>
            )}
            {!direct && (
              <WalletToggle balance={c.walletBalance} enabled={c.paymentMethod === 'pix'} checked={c.useWallet} onChange={c.setUseWallet} pendingDebt={c.pendingDebt ?? undefined} />
            )}
            {c.cpfRequired && (
              <Input id="sacola-cpf" label="CPF para o Pix" hint="O Pix exige o CPF de quem paga. Pedimos só uma vez."
                value={c.cpf} onChange={(v) => c.setCpf(maskCPF(v))} placeholder="000.000.000-00" inputMode="numeric" autoComplete="off" />
            )}
            <CouponField code={c.coupon.code} onCodeChange={c.coupon.setCode} onApply={c.coupon.apply} onRemove={c.coupon.remove}
              message={c.coupon.message} validating={c.coupon.validating} applied={c.coupon.discount > 0} />
          </section>

          {direct && (
            <div className={styles.directNote}>
              <ShieldCheck size={20} aria-hidden="true" />
              <p>O Pix vai <b>{`direto para a ${storeName}`}</b>. O DROP cuida da entrega, do rastreio e do suporte.</p>
            </div>
          )}

          </div>

          <aside className={styles.asideCol}>
            <section className={styles.block} aria-label="Resumo">
              <OrderSummary lines={lines} total={toPay} />
            </section>
            {barMode === 'desktop' && payBar(true)}
          </aside>
          </div>
          {barMode === 'mobile' && createPortal(payBar(false), document.body)}
        </main>
      )}

      <AddressPickerSheet open={pickerOpen} onClose={() => setPickerOpen(false)}
        addresses={c.address.addresses || []} selectedId={c.address.selected ? addressId(c.address.selected) : null}
        storeId={c.store?._id} storeName={storeName}
        onPick={(a) => {
          const idx = (c.address.addresses || []).findIndex((x: any) => addressId(x) === addressId(a));
          if (idx >= 0) c.address.selectAddress(idx);
          saveDeliveryAddressId(addressId(a));
          setPickerOpen(false);
        }}
        onAddNew={() => { setPickerOpen(false); setFormOpen(true); }}
        onSeeStores={(a) => { saveDeliveryAddressId(addressId(a)); setPickerOpen(false); router.push(buscarHref({ tab: 'lojas' })); }} />
      <AddressSheet open={formOpen} onClose={() => setFormOpen(false)} fields={c.address.fields} onField={c.address.setField}
        onCepBlur={() => c.address.lookupCep(c.address.fields.cep)}
        onSave={async () => {
          try {
            const saved = await c.address.saveAddress(c.address.fields);
            if (saved) saveDeliveryAddressId(addressId(saved as any));
            setFormOpen(false);
          } catch { showToast('Não conseguimos salvar o endereço. Confira o CEP e o número e tente de novo.', 'error'); }
        }} />

      {/* Fora dos ramos de estado: o pedido limpa a sacola ANTES do pixData chegar (teste movido). */}
      {c.pixData && (
        <PixPaymentSheet pix={c.pixData} paymentProvider={c.pixNotice.paymentProvider} recipientName={c.pixNotice.recipientName} amount={c.pixData.amount ?? pixAmount} storeName={c.pixNotice.recipientName || c.store?.name || undefined}
          onPaid={(id) => { markJustPaid(id); router.push(pedidoHref(id)); }} onClose={c.closePix} />
      )}
    </ProtectedRoute>
  );
}
