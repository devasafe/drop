const mongoose = require('mongoose');
require('dotenv').config();

// Conectar ao MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://Drop:1234@cluster.mongodb.net/drop?retryWrites=true&w=majority')
  .then(() => console.log('✅ Conectado ao MongoDB'))
  .catch(err => {
    console.error('❌ Erro ao conectar:', err);
    process.exit(1);
  });

// Schema Wallet (simples)
const walletSchema = new mongoose.Schema({
  owner: { type: String, required: true, index: true },
  ownerType: {
    type: String,
    enum: ['user', 'store', 'platform'],
    required: true,
    index: true
  },
  balance: { type: Number, default: 0, min: 0 },
  totalIncome: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  history: [{
    date: Date,
    type: { type: String, enum: ['credit', 'debit'] },
    amount: Number,
    reason: String,
    relatedId: String,
    reference: String
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Wallet = mongoose.model('Wallet', walletSchema);

// Schema User (simples para buscar)
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  role: String
});

const User = mongoose.model('User', userSchema);

async function seedWallets() {
  try {
    console.log('🔄 Buscando todos os usuários...');
    const users = await User.find({});
    console.log(`✅ Encontrados ${users.length} usuários`);

    // Limpar wallets existentes
    await Wallet.deleteMany({});
    console.log('🗑️ Wallets anteriores removidas');

    // Criar wallet para cada usuário
    const wallets = users.map(user => ({
      owner: user._id.toString(),
      ownerType: 'user',
      balance: Math.random() * 5000,
      totalIncome: Math.random() * 10000,
      totalSpent: Math.random() * 5000,
      history: [
        {
          date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          type: 'credit',
          amount: 100,
          reason: 'Ganho de entrega',
          reference: 'ORD-001'
        },
        {
          date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          type: 'debit',
          amount: 50,
          reason: 'Saque para conta bancária',
          reference: 'WITH-001'
        },
        {
          date: new Date(),
          type: 'credit',
          amount: 75.50,
          reason: 'Bônus promocional',
          reference: 'BON-001'
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    await Wallet.insertMany(wallets);
    console.log(`✅ ${wallets.length} carteiras criadas com sucesso!`);

    // Mostrar alguns exemplos
    console.log('\n📊 Exemplo de carteiras criadas:');
    const examples = await Wallet.find({}).limit(3).populate('owner');
    examples.forEach(w => {
      console.log(`  - Usuario: ${w.owner} | Saldo: R$ ${w.balance.toFixed(2)} | Ganhos: R$ ${w.totalIncome.toFixed(2)}`);
    });

    console.log('\n✨ Seed concluído!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err);
    process.exit(1);
  }
}

seedWallets();
