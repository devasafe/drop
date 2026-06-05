/**
 * Script para corrigir usuario "lj" - preencher user.storeId
 * 
 * Problema: User.storeId não foi preenchido quando a store foi criada
 * Solução: Encontrar a store e atualizar o user com o storeId
 */
const mongoose = require('mongoose');
const path = require('path');

const distPath = path.join(__dirname, 'dist');
const User = require(path.join(distPath, 'models', 'User')).default;
const Store = require(path.join(distPath, 'models', 'Store')).default;

async function fix() {
  try {
    console.log('🔌 Conectando ao MongoDB...');
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error('❌ Defina a variável de ambiente MONGODB_URI antes de rodar este script.');
      process.exit(1);
    }
    await mongoose.connect(uri);
    console.log('✅ Conectado!\n');
    
    // Encontrar usuario "lj"
    console.log('👤 Procurando usuario "lj"...');
    const user = await User.findOne({ name: 'lj' });
    
    if (!user) {
      console.log('❌ Usuario "lj" nao encontrado!');
      process.exit(1);
    }
    
    console.log('✅ Encontrado!', { _id: user._id, name: user.name, storeId: user.storeId });
    
    // Se ja tem storeId, nao fazer nada
    if (user.storeId) {
      console.log('✅ user.storeId ja está preenchido:', user.storeId);
      process.exit(0);
    }
    
    // Procurar store deste usuario
    console.log('\n🏪 Procurando store para este usuario...');
    const store = await Store.findOne({ ownerId: user._id });
    
    if (!store) {
      console.log('❌ Nenhuma store encontrada para este usuario!');
      process.exit(1);
    }
    
    console.log('✅ Store encontrada!', { _id: store._id, name: store.name });
    
    // Atualizar user.storeId
    console.log('\n📝 Atualizando user.storeId...');
    const updated = await User.findByIdAndUpdate(
      user._id,
      { storeId: store._id },
      { new: true }
    );
    
    console.log('✅ Atualizado com sucesso!');
    console.log({
      _id: updated._id,
      name: updated.name,
      storeId: updated.storeId
    });
    
    console.log('\n🎉 Correcao concluida!');
    console.log('   Usuario "lj" agora pode ver a carteira da loja em "Minha Carteira"');
    
    process.exit(0);
  } catch(e) {
    console.error('❌ Erro:', e.message);
    console.error(e);
    process.exit(1);
  }
}

fix();
