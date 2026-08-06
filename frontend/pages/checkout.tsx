import { useState } from 'react';
import { useRouter } from 'next/router';
import { XCircle, ShoppingBag, CreditCard } from 'lucide-react';
import ProtectedRoute from '../components/ProtectedRoute';
import { useCheckout } from '../hooks/useCheckout';
import { useToast } from '../components/ui/Toast';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { ICON_STROKE_WIDTH } from '../components/ui/Icon';
import { AddressSelector } from '../components/drop/checkout/AddressSelector';
import { AddressSheet } from '../components/drop/checkout/AddressSheet';
import { CheckoutItems } from '../components/drop/checkout/CheckoutItems';
import { CouponField } from '../components/drop/checkout/CouponField';
import { PaymentSelector } from '../components/drop/checkout/PaymentSelector';
import { WalletToggle } from '../components/drop/checkout/WalletToggle';
import { OrderSummary } from '../components/drop/checkout/OrderSummary';
import { CheckoutBar } from '../components/drop/checkout/CheckoutBar';
import { PixPaymentSheet } from '../components/drop/checkout/PixPaymentSheet';
import { CardForm } from '../components/drop/checkout/CardForm';
import { onlyDigits } from '../lib/masks';
import type { CardHolderInfo } from '../types/checkout';
import styles from './Checkout.module.css';

/**
 * Checkout — orquestração pura: toda a lógica (endereço, cupom, taxa de
 * entrega, carteira, pedido/PIX) vive em `useCheckout()` e nos hooks que ele
 * compõe (Tasks 2–5). Esta página só decide QUAL estado mostrar (bloqueado /
 * carregando / carrinho vazio / conteúdo) e conecta os componentes do DS
 * (Tasks 6–14) aos dados e callbacks do hook.
 */
export default function CheckoutPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const c = useCheckout();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Dados do titular do cartão (Fase 1, à vista): nome/email já vêm do
  // usuário logado; cpf/telefone não estão tipados em `AuthUser` (o login
  // não os retorna hoje — ver authController.ts) mas podem estar presentes
  // no objeto real (ex.: após completar o perfil em /minha-conta), daí o
  // cast defensivo. CEP/número vêm do endereço de entrega já selecionado no
  // checkout — sem eles o gateway Asaas recusa a transação de cartão.
  const userExtra = c.user as unknown as { cpf?: string; telefone?: string } | null;
  const holderDefaults: CardHolderInfo = {
    name: c.user?.name || '',
    email: c.user?.email || '',
    cpfCnpj: onlyDigits(userExtra?.cpf || ''),
    postalCode: onlyDigits(c.address.selected?.cep || ''),
    addressNumber: c.address.selected?.number || '',
    phone: onlyDigits(userExtra?.telefone || ''),
  };

  return (
    <ProtectedRoute required_role="cliente">
      {c.blocked ? (
        <div className={styles.blockedScreen}>
          <EmptyState
            icon={<XCircle size={22} strokeWidth={ICON_STROKE_WIDTH} />}
            title="Compras bloqueadas"
            description="Sua conta não está no modo Cliente. Alterne o modo na navbar para poder comprar."
          />
        </div>
      ) : c.address.loading ? (
        <div className={styles.page}>
          <div className={styles.container}>
            <div className={styles.loadingWrap}>
              <Skeleton height={120} radius="var(--r-lg)" />
              <Skeleton height={200} radius="var(--r-lg)" />
              <Skeleton height={160} radius="var(--r-lg)" />
            </div>
          </div>
        </div>
      ) : c.items.length === 0 ? (
        <div className={styles.emptyWrap}>
          <EmptyState
            icon={<ShoppingBag size={22} strokeWidth={ICON_STROKE_WIDTH} />}
            title="Seu carrinho está vazio"
            description="Adicione itens de uma loja para finalizar um pedido."
            action={<Button onClick={() => router.push('/')}>Explorar lojas</Button>}
          />
        </div>
      ) : (
        <>
          <div className={styles.page}>
            <div className={styles.container}>
              <h1 className={styles.title}>Checkout</h1>

              <section className={styles.section}>
                <AddressSelector
                  selected={c.address.selected}
                  addresses={c.address.addresses}
                  onPick={c.address.selectAddress}
                  onAddNew={() => setSheetOpen(true)}
                />
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>
                  <ShoppingBag size={18} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
                  Itens do pedido
                </h2>
                <CheckoutItems items={c.items} onChangeQty={c.updateQuantity} onRemove={c.removeItem} />
              </section>

              <section className={styles.section}>
                <CouponField
                  code={c.coupon.code}
                  onCodeChange={c.coupon.setCode}
                  onApply={c.coupon.apply}
                  onRemove={c.coupon.remove}
                  message={c.coupon.message}
                  validating={c.coupon.validating}
                  applied={c.coupon.discount > 0}
                />
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>
                  <CreditCard size={18} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
                  Forma de pagamento
                </h2>
                <PaymentSelector value={c.paymentMethod} onChange={c.setPaymentMethod} />
                {c.paymentMethod === 'credit_card' && (
                  <div className={styles.cardFormWrap}>
                    <CardForm onChange={c.setCardPayload} holderDefaults={holderDefaults} />
                  </div>
                )}
              </section>

              <section className={styles.section}>
                <WalletToggle
                  balance={c.walletBalance}
                  enabled={c.paymentMethod === 'pix'}
                  checked={c.useWallet}
                  onChange={c.setUseWallet}
                  pendingDebt={c.pendingDebt ?? undefined}
                />
              </section>

              <section className={styles.section}>
                <OrderSummary
                  subtotal={c.subtotal}
                  deliveryFee={c.deliveryFee}
                  discount={c.discount}
                  total={c.total}
                  isPlan1={c.isPlan1}
                />
              </section>
            </div>
          </div>

          <AddressSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            fields={c.address.fields}
            onField={c.address.setField}
            onCepBlur={() => c.address.lookupCep(c.address.fields.cep)}
            onSave={async () => {
              await c.address.saveAddress(c.address.fields);
              setSheetOpen(false);
            }}
          />

          <CheckoutBar
            total={c.total}
            disabled={
              !c.canPlace ||
              c.placing ||
              c.isWalletInsufficient ||
              (c.paymentMethod === 'credit_card' && !c.cardPayload?.valid)
            }
            loading={c.placing}
            hint={
              !c.canPlace
                ? 'Confirme o endereço no mapa'
                : c.isWalletInsufficient
                  ? 'Saldo insuficiente'
                  : (c.paymentMethod === 'credit_card' && !c.cardPayload?.valid)
                    ? 'Preencha os dados do cartão'
                    : undefined
            }
            onConfirm={async () => {
              const r = await c.placeOrder();
              if (!r.ok && r.error) showToast(r.error, 'error');
            }}
          />
        </>
      )}

      {/* Sheet de pagamento PIX: overlay que precisa aparecer sobre QUALQUER
          estado — inclusive o "carrinho vazio". Ao criar o pedido, o carrinho
          é limpo antes de `pixData` ser setado; se o sheet ficasse dentro do
          ramo "com itens", a página cairia no EmptyState e esconderia o QR. */}
      {c.pixData && (
        <PixPaymentSheet
          pix={c.pixData}
          onPaid={(id) => router.push('/store-order/' + id)}
          onClose={c.closePix}
        />
      )}
    </ProtectedRoute>
  );
}
