const mongoose = require('mongoose');
const path = require('path');

// Usar dist se existir
const distPath = path.join(__dirname, 'dist');
const User = require(path.join(distPath, 'models', 'User')).default;
const Store = require(path.join(distPath, 'models', 'Store')).default;
const Wallet = require(path.join(distPath, 'models', 'Wallet')).default;

async function check() {
  try {
    console.log('🔌 Conectando ao MongoDB...');
    await mongoose.connect('mongodb://localhost:27017/drop');
    
    console.log('\n👤 Procurando usuario "lj"...');
    const user = await User.findOne({ name: 'lj' });
    
    if (!user) {
      console.log('❌ Usuario "lj" nao encontrado!');
      process.exit(1);
    }
    
    console.log('✅ Encontrado!');
    console.log({
      name: user.name,
      email: user.email,
      storeId: user.storeId,
      activeRole: user.activeRole,
      role: user.role
    });
    
    // Verificar wallets do usuario
    console.log('\n💰 Wallets do usuario:');
    const userWallets = await Wallet.find({ owner: user._id.toString() });
    console.log(`  User wallets (owner=userId): ${userWallets.length}`);
    if (userWallets.length > 0) {
      userWallets.forEach(w => {
        console.log(`    - ${w.ownerType}: balance=${w.balance}`);
      });
    }
    
    // Se tiver storeId, verificar wallet da loja
    if (user.storeId) {
      console.log('\n🏪 Verificando wallet da loja...');
      const storeWallets = await Wallet.find({ owner: user.storeId.toString() });
      console.log(`  Store wallets (owner=storeId): ${storeWallets.length}`);
      if (storeWallets.length > 0) {
        storeWallets.forEach(w => {
          console.log(`    - ${w.ownerType}: balance=${w.balance}`);
        });
      }
    } else {
      console.log('\n⚠️  user.storeId está VAZIO!');
      
      // Procurar stores para este user
      const stores = await Store.find({ ownerId: user._id });
      console.log(`\n🔍 Stores para este owner: ${stores.length}`);
      if (stores.length > 0) {
        stores.forEach(s => {
          console.log(`  - ${s.name} (ID: ${s._id})`);
        });
        console.log('\n💡 SOLUCAO: Atualizar user.storeId para apontar para uma dessas stores');
      }
    }
    
    process.exit(0);
  } catch(e) {
    console.error('❌ Erro:', e.message);
    process.exit(1);
  }
}

check();
