// Tipos compartilhados do fluxo de checkout (frontend/pages/checkout.tsx e afins).
//
// PaymentMethod: confirmado contra o backend (não é o mesmo conjunto do enum
// Prisma `PaymentMethod`, que também tem `debit_card`/`cash_on_delivery` para
// pedidos legados). O que a API de fato aceita em POST /orders é o union
// abaixo — ver `src/validation/schemas.ts` (`CreateOrderSchema.paymentMethod`,
// `z.enum(['credit_card', 'pix', 'money'])`) e `src/controllers/orderController.ts`,
// que bloqueia `cash_on_delivery` com 400 (COD descontinuado, decisão de
// design 2026-06-18).
export type PaymentMethod = 'pix' | 'credit_card' | 'money';

export interface CartItem {
  productId: string;
  quantity: number;
  name?: string;
  price?: number;
  storeId?: string;
}

export interface Address {
  _id?: string;
  label?: string;
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  complement?: string;
  latitude: string;
  longitude: string;
}

export interface PlatformFeeConfig {
  base: number;
  perKm: number;
}

export interface PixInfo {
  qrCodeImage?: string;   // base64 sem prefixo data:
  qrCodePayload?: string; // copia-e-cola
  expiresAt?: string;
  orderId: string;
}

export interface OrderProduct {
  productId: string;
  quantity: number;
  price?: number;
}

// Cartão à vista (Fase 1) — POST /orders com paymentMethod:'credit_card' exige
// `card` (dados do próprio cartão) e `cardHolder` (dados do titular exigidos
// pelo gateway Asaas). `number`/`cpfCnpj`/`postalCode`/`phone` vão só-dígitos;
// `expiryMonth`='MM', `expiryYear`='YYYY'. Ver task-4-brief.md.
export interface CardData {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}

export interface CardHolderInfo {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  phone: string;
}

export interface PlaceOrderPayload {
  storeId: string;
  products: OrderProduct[];
  deliveryDistanceKm: number;
  paymentMethod: PaymentMethod;
  address: string;
  latitude: number;
  longitude: number;
  idempotentKey: string;
  cupomCode?: string;
  useWalletBalance?: boolean;
  card?: CardData;
  cardHolder?: CardHolderInfo;
}
