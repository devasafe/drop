import { isCreditEntry, paymentMethodLabel, transactionLabel, transactionStatus, type WalletTransaction } from '../walletLabels';

const tx = (over: Partial<WalletTransaction>): WalletTransaction => ({
  type: 'credit', amount: 10, status: 'completed', createdAt: '2026-10-08T10:00:00Z', ...over,
});

describe('walletLabels (mesma inferência da página antiga)', () => {
  it('usa a categoria quando ela vem', () => {
    expect(transactionLabel(tx({ category: 'deposit' }))).toBe('Depósito');
    expect(transactionLabel(tx({ category: 'withdrawal', type: 'debit' }))).toBe('Saque');
    expect(transactionLabel(tx({ category: 'payment', type: 'debit' }))).toBe('Pagamento');
    expect(transactionLabel(tx({ category: 'refund', type: 'refund' }))).toBe('Estorno');
    expect(transactionLabel(tx({ category: 'transfer' }))).toBe('Transferência');
  });

  it('sem categoria, infere pelo motivo', () => {
    expect(transactionLabel(tx({ reason: 'Carregamento via Pix' }))).toBe('Depósito');
    expect(transactionLabel(tx({ reason: 'Transferência para banco', type: 'debit' }))).toBe('Saque');
    expect(transactionLabel(tx({ reason: 'Pedido #12', type: 'debit' }))).toBe('Pagamento');
    expect(transactionLabel(tx({ reason: 'Reembolso do pedido' }))).toBe('Estorno');
    expect(transactionLabel(tx({ reason: 'Transferência de carteira' }))).toBe('Transferência');
  });

  it('sem categoria nem motivo conhecido: pelo tipo', () => {
    expect(transactionLabel(tx({ type: 'credit' }))).toBe('Entrada');
    expect(transactionLabel(tx({ type: 'debit' }))).toBe('Retirada');
    expect(transactionLabel(tx({ type: 'refund' }))).toBe('Estorno');
  });

  it('meio de pagamento em português', () => {
    expect(paymentMethodLabel('pix')).toBe('Pix');
    expect(paymentMethodLabel('credit_card')).toBe('Cartão');
    expect(paymentMethodLabel('outro')).toBe('outro');
    expect(paymentMethodLabel(null)).toBe('');
  });

  it('crédito e estorno entram; o resto sai', () => {
    expect(isCreditEntry(tx({ type: 'credit' }))).toBe(true);
    expect(isCreditEntry(tx({ type: 'refund' }))).toBe(true);
    expect(isCreditEntry(tx({ type: 'debit' }))).toBe(false);
    expect(isCreditEntry(tx({ type: 'withdrawal' }))).toBe(false);
  });

  it('situação', () => {
    expect(transactionStatus(tx({ status: 'completed' }))).toEqual({ label: 'Concluída', tone: 'ok' });
    expect(transactionStatus(tx({ status: 'pending' }))).toEqual({ label: 'Pendente', tone: 'warn' });
    expect(transactionStatus(tx({ status: 'failed' }))).toEqual({ label: 'Falhou', tone: 'bad' });
  });
});
