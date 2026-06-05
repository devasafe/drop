export interface Address {
  _id?: string;
  label?: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  cep?: string;
  zip?: string;
  latitude?: string;
  longitude?: string;
  isDefault?: boolean;
}

export interface Product {
  _id: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
  category?: string;
  storeId?: string;
  stock?: number;
  active?: boolean;
}

export interface Store {
  _id: string;
  name: string;
  email?: string;
  telefone?: string;
  address?: string;
  latitude?: string | number;
  longitude?: string | number;
  image?: string;
  ownerId?: string;
}

export interface OrderProduct {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  image?: string;
}

export interface WalletDistribution {
  storeAmount: number;
  appCommission: number;
  commissionPercent: number;
  delivery?: {
    total: number;
    motoboyAmount: number;
    appCommission: number;
    commissionPercent: number;
  };
}

export interface Order {
  _id: string;
  status: string;
  totalValue: number;
  deliveryFee?: number;
  products: OrderProduct[];
  storeId?: string;
  storeName?: string;
  customerId?: string;
  deliveryId?: string;
  walletDistribution?: WalletDistribution;
  createdAt?: string;
  customerObj?: Record<string, any>;
  storeObj?: Record<string, any>;
}

export interface Delivery {
  _id: string;
  status: string;
  orderId: string;
  storeId?: string;
  customerId?: string;
  motoboyId?: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  fee?: number;
  distance?: number;
  pin?: string;
  pinRetirada?: string;
  rating?: number;
  comment?: string;
  storeAddress?: string;
  customerAddress?: string;
  storeLatitude?: number | string;
  storeLongitude?: number | string;
  customerLatitude?: number | string;
  customerLongitude?: number | string;
  order?: Partial<Order>;
  storeObj?: Partial<Store>;
  customerObj?: Record<string, any>;
}

export interface WalletHistoryEntry {
  _id?: string;
  date: string;
  type: 'credit' | 'debit';
  category: string;
  amount: number;
  reason?: string;
  paymentMethod?: string;
  relatedId?: string;
  reference?: string;
}

export interface Wallet {
  _id: string;
  owner: string;
  ownerType: 'user' | 'store' | 'motoboy';
  balance: number;
  totalIncome: number;
  totalSpent: number;
  history: WalletHistoryEntry[];
}

export interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  text: string;
  createdAt: string;
  read?: boolean;
  attachments?: string[];
}

export interface Conversation {
  _id: string;
  type: string;
  participants: Array<{
    userId: string;
    role: string;
    name: string;
  }>;
  lastMessage?: Partial<Message>;
  unreadCount?: number;
  orderId?: string;
  deliveryId?: string;
  createdAt?: string;
}

export interface Notification {
  _id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  type?: string;
  relatedId?: string;
  createdAt?: string;
}
