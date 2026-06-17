import { ClientSession } from 'mongoose';
import Wallet, { IWallet } from '../models/Wallet';
import AppCashbox from '../models/AppCashbox';
import logger from '../config/logger';

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

export interface OrderWalletSnapshot {
  customerId: string | any;
  storeId: string | any;
  totalValue: number;
  walletDistribution?: WalletDistribution;
  _id?: any;
}

class WalletService {
  /**
   * Busca ou cria a carteira de um usuário/loja.
   * Centraliza a lógica de upsert usada em múltiplos controllers.
   */
  async getOrCreate(
    owner: string,
    ownerType: 'user' | 'store' | 'motoboy',
    session?: ClientSession
  ): Promise<IWallet> {
    const query = Wallet.findOne({ owner, ownerType });
    if (session) query.session(session);

    let wallet = await query;
    if (!wallet) {
      const newWallet = new Wallet({
        owner,
        ownerType,
        balance: 0,
        totalIncome: 0,
        totalSpent: 0,
        history: [],
      });
      wallet = await (session ? newWallet.save({ session }) : newWallet.save());
    }
    return wallet;
  }

  // processOrderPayment, revertOrderPayment e creditMotoboy foram removidos.
  // Agora o fluxo financeiro passa por payoutService (payout.service.ts).

  /**
   * Registra um débito manual em uma carteira (penalidade, saque, etc.)
   */
  async debit(params: {
    owner: string;
    ownerType: 'user' | 'store' | 'motoboy';
    amount: number;
    reason: string;
    category?: 'withdrawal' | 'penalty' | 'transfer';
    reference?: string;
  }): Promise<void> {
    const { owner, ownerType, amount, reason, category, reference } = params;

    // ✅ ATÔMICO: o filtro `balance >= amount` + `$inc` garante que dois débitos
    // concorrentes não derrubem o saldo abaixo de zero (sem race condition).
    const updated = await Wallet.findOneAndUpdate(
      { owner, ownerType, balance: { $gte: amount } },
      {
        $inc: { balance: -amount, totalSpent: amount },
        $push: {
          history: {
            date: new Date(),
            type: 'debit',
            category: category ?? 'withdrawal',
            amount,
            reason,
            reference,
          },
        },
      },
      { new: true }
    );

    if (!updated) {
      // Ou a carteira não existe, ou não há saldo suficiente.
      const existing = await Wallet.findOne({ owner, ownerType });
      throw Object.assign(new Error('Saldo insuficiente'), {
        statusCode: 400,
        available: existing?.balance ?? 0,
        required: amount,
      });
    }
  }
}

export default new WalletService();
