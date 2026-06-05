/**
 * Script para limpar todos os dados financeiros do banco.
 * Usado antes de deploy da nova versão com fluxo AppCashbox-first + Payouts.
 *
 * Uso: npx ts-node scripts/wipe-financial-data.ts --confirm
 */

import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/drop';

async function wipe() {
  const args = process.argv.slice(2);
  if (!args.includes('--confirm')) {
    console.log('⚠️  Este script apaga TODOS os dados financeiros do banco.');
    console.log('    Para confirmar, rode com: --confirm');
    console.log('');
    console.log('    npx ts-node scripts/wipe-financial-data.ts --confirm');
    process.exit(1);
  }

  console.log('🔌 Conectando ao MongoDB...');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('❌ Não foi possível conectar ao banco');
    process.exit(1);
  }

  console.log('🗑️  Limpando dados financeiros...\n');

  // 1. Reset wallets
  const walletResult = await db.collection('wallets').updateMany({}, {
    $set: {
      balance: 0,
      totalIncome: 0,
      totalSpent: 0,
      availableBalance: 0,
      pendingBalance: 0,
      blockedBalance: 0,
      history: [],
    },
  });
  console.log(`  Wallets resetadas: ${walletResult.modifiedCount}`);

  // 2. Apagar AppCashbox
  const cashboxResult = await db.collection('appcashboxes').deleteMany({});
  console.log(`  AppCashbox removidos: ${cashboxResult.deletedCount}`);

  // 3. Apagar Orders
  const orderResult = await db.collection('orders').deleteMany({});
  console.log(`  Orders removidos: ${orderResult.deletedCount}`);

  // 4. Apagar Transactions
  const txResult = await db.collection('transactions').deleteMany({});
  console.log(`  Transactions removidos: ${txResult.deletedCount}`);

  // 5. Apagar Payouts
  const payoutResult = await db.collection('payouts').deleteMany({});
  console.log(`  Payouts removidos: ${payoutResult.deletedCount}`);

  // 6. Apagar WithdrawalRequests
  const wrResult = await db.collection('withdrawalrequests').deleteMany({});
  console.log(`  WithdrawalRequests removidos: ${wrResult.deletedCount}`);

  // 7. Apagar Withdrawals
  const wResult = await db.collection('withdrawals').deleteMany({});
  console.log(`  Withdrawals removidos: ${wResult.deletedCount}`);

  // 8. Apagar Deliveries
  const delResult = await db.collection('deliveries').deleteMany({});
  console.log(`  Deliveries removidos: ${delResult.deletedCount}`);

  // 9. Apagar CustomerDebts
  const debtResult = await db.collection('customerdebts').deleteMany({});
  console.log(`  CustomerDebts removidos: ${debtResult.deletedCount}`);

  // 10. Apagar Cancellations
  const cancelResult = await db.collection('cancellations').deleteMany({});
  console.log(`  Cancellations removidos: ${cancelResult.deletedCount}`);

  console.log('\n✅ Dados financeiros limpos com sucesso!');
  console.log('   O AppCashbox será recriado automaticamente no primeiro acesso.');

  await mongoose.disconnect();
  process.exit(0);
}

wipe().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
