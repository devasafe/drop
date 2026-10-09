export interface BankInfo {
  bankName: string;
  accountType: string;
  accountNumber: string;
  routingNumber: string;
  ownerName: string;
}

export interface TransferInput {
  payoutIds: string[];
  bankInfo: BankInfo;
  amount: number;
  recipientName: string;
}

export interface TransferResult {
  status: 'pending' | 'paid' | 'failed';
  gatewayTransferId: string;
  errorMessage?: string;
  /** Sem resposta clara (timeout, rede, 5xx): a transferência pode ter saído. Nunca reenviar às cegas. */
  uncertain?: boolean;
}

export interface IPayoutGateway {
  readonly provider: string;
  transfer(input: TransferInput): Promise<TransferResult>;
  getStatus(gatewayTransferId: string): Promise<{ status: 'pending' | 'paid' | 'failed' }>;
}
