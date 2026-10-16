/** Rótulos do extrato de carteira (mesma inferência da página antiga, l. 214-264, sem as abreviações). */
import type { StatusTone } from '../StatusTag';

export type WalletCategory = 'deposit' | 'withdrawal' | 'payment' | 'refund' | 'transfer';

export interface WalletTransaction {
  _id?: string;
  type: 'credit' | 'debit' | 'withdrawal' | 'refund';
  category?: WalletCategory | null;
  amount: number;
  reason?: string | null;
  description?: string | null;
  paymentMethod?: string | null;
  status: 'completed' | 'pending' | 'failed';
  createdAt: string;
}

const CATEGORY_LABEL: Record<WalletCategory, string> = {
  deposit: 'Depósito', withdrawal: 'Saque', payment: 'Pagamento', refund: 'Estorno', transfer: 'Transferência',
};

const METHOD_LABEL: Record<string, string> = {
  credit_card: 'Cartão', pix: 'Pix', bank_transfer: 'Transferência bancária', wallet: 'Carteira',
  wallet_transfer: 'Transferência de carteira', refund: 'Reembolso',
};

export function transactionCategory(tx: WalletTransaction): WalletCategory | null {
  if (tx.category) return tx.category;
  const reason = tx.reason || '';
  if (reason.includes('Carregamento') || reason.includes('Depósito')) return 'deposit';
  if (reason.includes('Transferência para banco')) return 'withdrawal';
  if (reason.includes('Pedido') || reason.includes('Venda')) return 'payment';
  if (reason.includes('Reembolso')) return 'refund';
  if (reason.includes('Transferência')) return 'transfer';
  return null;
}

export function transactionLabel(tx: WalletTransaction): string {
  const category = transactionCategory(tx);
  if (category) return CATEGORY_LABEL[category];
  if (tx.type === 'refund') return 'Estorno';
  if (tx.type === 'credit') return 'Entrada';
  if (tx.type === 'debit') return 'Retirada';
  return 'Transação';
}

export function paymentMethodLabel(method?: string | null): string {
  if (!method) return '';
  return METHOD_LABEL[method] ?? method;
}

/** Entra na carteira (sinal +): crédito e estorno, como na página antiga. */
export function isCreditEntry(tx: WalletTransaction): boolean {
  return tx.type === 'credit' || tx.type === 'refund';
}

export function transactionStatus(tx: WalletTransaction): { label: string; tone: StatusTone } {
  if (tx.status === 'completed') return { label: 'Concluída', tone: 'ok' };
  if (tx.status === 'pending') return { label: 'Pendente', tone: 'warn' };
  return { label: 'Falhou', tone: 'bad' };
}
