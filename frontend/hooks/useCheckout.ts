import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useStores } from './useSync';
import { useCheckoutAddress } from './useCheckoutAddress';
import { useCoupon } from './useCoupon';
import { useDeliveryFee } from './useDeliveryFee';
import { Address, CardHolderInfo, PaymentMethod, PixInfo, PlatformFeeConfig, PlaceOrderPayload } from '../types/checkout';
import type { CardPayload } from '../components/drop/checkout/CardForm';
import { onlyDigits } from '../lib/masks';

const DRAFT_KEY = 'checkout_draft';

interface CheckoutDraft {
  fields: Address;
  paymentMethod: PaymentMethod;
}

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0; const v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16);
});

// Resposta de POST /orders: gateway Asaas retorna { order, pix } (PIX) ou
// { order, card:{status,approved} } (cartão, aprovado/pendente — recusado
// vem como HTTP 402 e cai no catch); fluxo legado (pedido já pago pela
// carteira) retorna o pedido puro no corpo.
type OrderLike = { _id: string };
type PlaceOrderResponse =
  | { order: OrderLike; pix?: Omit<PixInfo, 'orderId'>; card?: { status: string; approved: boolean } }
  | OrderLike;

// GET /settings/platform-config — campos reais confirmados em checkout.tsx:201-203
// (usados hoje pra calcular a taxa de entrega cobrada do cliente, não só o
// repasse do motoboy): motoboyCutPerDelivery = base fixa, motoboyCutPerKm = por km.
interface PlatformConfigResponse {
  motoboyCutPerDelivery?: number;
  motoboyCutPerKm?: number;
}

// GET /debts/my-pending — ver debtController.ts: `{ debt: CustomerDebt | null }`.
// `amount` é Decimal no Prisma (schema.prisma:659) — serializa como string em
// JSON, então normalizamos pra number aqui em vez de repassar cru.
interface PendingDebtResponse {
  debt: { amount: number | string } | null;
}

// GET /user/me — userController.ts:getMe devolve o registro do usuário quase
// inteiro (`{ ...safe, _id }`, só passwordHash/bankInfoEncrypted removidos),
// então `cpf`/`telefone` vêm aqui. IMPORTANTE: `AuthContext`/login NÃO tem
// esses campos (ver authController.ts:154-166) — é por isso que essa busca
// existe: sem ela, `cardHolder.cpfCnpj`/`phone` ficam sempre vazios e o
// backend rejeita (400) TODO pedido de cartão (Zod exige
// `cpfCnpj` 11/14 dígitos e `phone` 10/11 dígitos — ver validation/schemas.ts).
interface UserProfileResponse {
  cpf?: string;
  telefone?: string;
}

export function useCheckout() {
  const router = useRouter();
  const { cart, clear, updateQuantity, removeItem } = useCart();
  const { user } = useAuth();
  const { stores } = useStores();
  const address = useCheckoutAddress();

  const storeId = cart.length > 0 ? cart[0].storeId || '' : '';
  const store = stores.find((s: { _id: string; plan?: number; latitude?: string; longitude?: string }) => s._id === storeId);
  const isPlan1 = store?.plan === 1;

  const subtotal = useMemo(
    () => cart.reduce((sum: number, c: { price?: number; quantity: number }) => sum + (c.price || 0) * c.quantity, 0),
    [cart]
  );

  const coupon = useCoupon({ storeId, subtotal });

  const [config, setConfig] = useState<PlatformFeeConfig | null>(null);
  const [distanceKm, setDistanceKm] = useState(0);
  const { deliveryFee } = useDeliveryFee({ distanceKm, config, isPlan1 });

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [walletBalance, setWalletBalance] = useState(0);
  const [useWallet, setUseWallet] = useState(false);
  const [pendingDebt, setPendingDebt] = useState<number | null>(null);
  const [placing, setPlacing] = useState(false);
  const [pixData, setPixData] = useState<PixInfo | null>(null);
  const [cardPayload, setCardPayload] = useState<CardPayload | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileResponse>({});
  const [blocked, setBlocked] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const total = subtotal + deliveryFee - coupon.discount;
  // PIX e cartão de crédito são cobranças externas (Asaas) — não dependem de
  // saldo de carteira. Só métodos que efetivamente debitam a carteira exigem saldo.
  const isWalletInsufficient = paymentMethod !== 'pix' && paymentMethod !== 'credit_card' && walletBalance < total;

  // Guard: só 'cliente' pode comprar (motoboy/lojista/etc bloqueados).
  useEffect(() => {
    const role = user?.activeRole || user?.role;
    setBlocked(!!(user && role && role !== 'cliente'));
  }, [user]);

  // Guard: loja Plano 1 usa checkout-vitrine dedicado (sem motoboy).
  useEffect(() => {
    if (isPlan1) router.replace('/checkout-vitrine');
  }, [isPlan1, router]);

  // Restaura rascunho (endereço em edição + método de pagamento) salvo em
  // localStorage — uma única vez ao montar. `hydrated` só vira true depois
  // dessa tentativa, pra o effect de auto-save (abaixo) nunca sobrescrever
  // um rascunho existente com os valores vazios do estado inicial.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<CheckoutDraft>;
        if (draft.fields) address.setFields(draft.fields);
        if (draft.paymentMethod) setPaymentMethod(draft.paymentMethod);
      }
    } catch {
      // rascunho corrompido — ignora e segue com estado vazio
    } finally {
      setHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-salva o rascunho a cada mudança de endereço/pagamento — só depois
  // de hidratado (ver acima).
  useEffect(() => {
    if (!hydrated) return;
    try {
      const draft: CheckoutDraft = { fields: address.fields, paymentMethod };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // localStorage indisponível (quota/privado) — rascunho é best-effort
    }
  }, [hydrated, address.fields, paymentMethod]);

  // Carteira + config de taxa de entrega (com cleanup pra evitar setState após unmount).
  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;
    api.get<{ balance: number }>('/wallets/my-wallet')
      .then(r => { if (!cancelled) setWalletBalance(r.data.balance || 0); })
      .catch(() => {});
    api.get<PlatformConfigResponse>('/settings/platform-config')
      .then(r => {
        if (cancelled) return;
        setConfig({
          base: r.data.motoboyCutPerDelivery ?? 7,
          perKm: r.data.motoboyCutPerKm ?? 1,
        });
      })
      .catch(() => {});
    api.get<PendingDebtResponse>('/debts/my-pending')
      .then(r => { if (!cancelled) setPendingDebt(r.data.debt ? Number(r.data.debt.amount) : null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]);

  // Perfil completo (cpf/telefone) pro titular do cartão — ver
  // `UserProfileResponse` acima. Busca separada da anterior (não é
  // wallet/config/debt) porque é especificamente o dado que faltava em
  // `user` (AuthContext) e travava todo pedido de cartão com 400.
  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;
    api.get<UserProfileResponse>('/user/me')
      .then(r => { if (!cancelled) setUserProfile({ cpf: r.data.cpf, telefone: r.data.telefone }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]);

  // Auto-seleciona o endereço padrão (isDefault, ver addressController.ts) assim
  // que a lista carrega — sem isso o cliente recorrente tinha que escolher o
  // endereço de novo a cada checkout. Só roda enquanto nada foi selecionado
  // ainda, então não sobrescreve uma escolha manual do usuário.
  useEffect(() => {
    if (address.loading || address.selected || address.addresses.length === 0) return;
    const idx = address.addresses.findIndex((a: { isDefault?: boolean }) => a.isDefault);
    address.selectAddress(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address.loading, address.selected, address.addresses]);

  // Distância real de rota (loja -> endereço selecionado) via Google Directions.
  // Defensivo: sem Google Maps carregado ou sem endereço/loja com coordenadas, não faz nada.
  useEffect(() => {
    const sel = address.selected;
    const g = (window as { google?: { maps?: { DirectionsService: new () => { route: (req: unknown, cb: (res: { routes: { legs: { distance: { value: number } }[] }[] }, status: string) => void) => void }; TravelMode: { DRIVING: string } } } }).google;
    if (isPlan1 || !sel?.latitude || !store?.latitude || !g?.maps) return;
    const svc = new g.maps.DirectionsService();
    svc.route({
      origin: { lat: parseFloat(store.latitude), lng: parseFloat(store.longitude || '0') },
      destination: { lat: parseFloat(sel.latitude), lng: parseFloat(sel.longitude) },
      travelMode: g.maps.TravelMode.DRIVING,
    }, (res, status) => {
      if (status === 'OK') setDistanceKm(Number((res.routes[0].legs[0].distance.value / 1000).toFixed(2)));
      else setDistanceKm(0);
    });
  }, [address.selected, store, isPlan1]);

  const canPlace = isPlan1 ? true : distanceKm >= 0.1;

  // Dados do titular pro CardForm (Fase 1, à vista): name/email vêm do
  // usuário logado, cpf/telefone de `/user/me` (ver effect acima —
  // AuthContext não tem esses campos), postalCode/addressNumber do endereço
  // de entrega já selecionado no checkout. `CardForm` usa isso só como
  // valor inicial (prefill) — cpf/telefone continuam editáveis lá, como
  // rede de segurança caso o perfil do usuário esteja incompleto.
  const cardHolderDefaults: CardHolderInfo = useMemo(() => ({
    name: user?.name || '',
    email: user?.email || '',
    cpfCnpj: onlyDigits(userProfile.cpf || ''),
    postalCode: onlyDigits(address.selected?.cep || ''),
    addressNumber: address.selected?.number || '',
    phone: onlyDigits(userProfile.telefone || ''),
  }), [user?.name, user?.email, userProfile, address.selected]);

  const placeOrder = async (): Promise<{ ok: boolean; error?: string }> => {
    if (!canPlace) return { ok: false, error: 'Confirme o endereço no mapa' };
    if (!address.selected) return { ok: false, error: 'Selecione um endereço de entrega' };
    if (placing) return { ok: false };
    setPlacing(true);
    try {
      const sel = address.selected;
      const addrStr = `${sel.street}, ${sel.number} - ${sel.neighborhood}, ${sel.city} - ${sel.state}, ${sel.cep}`;
      const payload: PlaceOrderPayload = {
        storeId,
        products: cart.map((c: { productId: string; quantity: number; price?: number }) => ({ productId: c.productId, quantity: c.quantity, price: c.price })),
        deliveryDistanceKm: isPlan1 ? 0 : Number(distanceKm),
        paymentMethod,
        address: addrStr,
        latitude: Number(sel.latitude),
        longitude: Number(sel.longitude),
        idempotentKey: uuid(),
      };
      if (paymentMethod === 'credit_card') {
        if (!cardPayload?.valid) return { ok: false, error: 'Dados do cartão incompletos' };
        payload.card = cardPayload.card;
        payload.cardHolder = cardPayload.cardHolder;
      }
      if (coupon.code.trim()) payload.cupomCode = coupon.code.trim().toUpperCase();
      if (useWallet && walletBalance > 0 && paymentMethod === 'pix') payload.useWalletBalance = true;

      const res = await api.post<PlaceOrderResponse>('/orders', payload);
      const data = res.data;
      const order: OrderLike = 'order' in data ? data.order : data;
      const pix = 'pix' in data ? data.pix : undefined;

      localStorage.removeItem('cart');
      localStorage.removeItem(DRAFT_KEY);
      clear();

      if (pix) {
        setPixData({ ...pix, orderId: order._id });
      } else {
        router.push(`/store-order/${order._id}`);
      }
      return { ok: true };
    } catch (err) {
      const d = (err as { response?: { data?: { error?: string; detail?: string } } })?.response?.data;
      return { ok: false, error: d?.detail ? `${d.error || 'Erro'} — ${d.detail}` : (d?.error || 'Falha ao criar pedido. Tente novamente.') };
    } finally {
      setPlacing(false);
    }
  };

  const closePix = () => {
    if (pixData) router.push(`/store-order/${pixData.orderId}`);
  };

  return {
    items: cart, updateQuantity, removeItem, subtotal, deliveryFee, discount: coupon.discount, total,
    paymentMethod, setPaymentMethod, walletBalance, useWallet, setUseWallet, pendingDebt,
    isWalletInsufficient, distanceKm, canPlace, placing, placeOrder, pixData, closePix,
    address, coupon, isPlan1, blocked, cardPayload, setCardPayload, cardHolderDefaults,
  };
}
