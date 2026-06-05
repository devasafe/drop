import crypto from 'crypto';
import { IPayoutGateway, TransferInput, TransferResult } from './types';

export class ManualGateway implements IPayoutGateway {
  readonly provider = 'manual';

  async transfer(_input: TransferInput): Promise<TransferResult> {
    return {
      status: 'pending',
      gatewayTransferId: 'manual_' + crypto.randomUUID(),
    };
  }

  async getStatus(_gatewayTransferId: string): Promise<{ status: 'pending' | 'paid' | 'failed' }> {
    return { status: 'pending' };
  }
}
