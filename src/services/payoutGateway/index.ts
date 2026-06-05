import { env } from '../../config/env';
import { IPayoutGateway } from './types';
import { ManualGateway } from './manualGateway';

export function getPayoutGateway(): IPayoutGateway {
  const provider = env.PAYOUT_GATEWAY || 'manual';
  switch (provider) {
    case 'manual':
      return new ManualGateway();
    default:
      throw new Error(`Gateway de payout "${provider}" não implementado`);
  }
}

export type { IPayoutGateway, TransferInput, TransferResult, BankInfo } from './types';
