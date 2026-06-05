#!/usr/bin/env node

/**
 * Script de migração: converte mainAddress para isDefault na lista de addresses
 * Uso: node migrate-addresses.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const User = require('./src/models/User').default;

async function migrate() {
  try {
    console.log('\n🔄 Iniciando migração de endereços...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/drop');
    
    // Buscar todos os usuários
    const users = await User.find({});
    console.log(`📊 Total de usuários: ${users.length}`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const user of users) {
      user.addresses = user.addresses || [];
      
      // Se não tem mainAddress, pular
      if (!user.mainAddress || !user.mainAddress.street) {
        skippedCount++;
        continue;
      }
      
      console.log(`\n👤 ${user.name} (${user.email})`);
      console.log(`   📍 mainAddress: ${user.mainAddress.street}, ${user.mainAddress.number}`);
      console.log(`   📦 addresses.length: ${user.addresses.length}`);
      
      // Procurar se o mainAddress está em addresses
      const foundIndex = user.addresses.findIndex(addr => 
        addr.street === user.mainAddress.street &&
        addr.number === user.mainAddress.number &&
        addr.cep === user.mainAddress.cep
      );
      
      if (foundIndex >= 0) {
        // Já existe em addresses, apenas marcar como padrão
        console.log(`   ✅ Encontrado em addresses[${foundIndex}]`);
        user.addresses.forEach((addr, idx) => {
          addr.isDefault = (idx === foundIndex);
        });
      } else {
        // Não existe, adicionar como novo endereço padrão
        console.log(`   ➕ Adicionando como novo endereço`);
        user.mainAddress.isDefault = true;
        user.addresses.push(user.mainAddress);
        // Remover isDefault dos outros
        for (let i = 0; i < user.addresses.length - 1; i++) {
          user.addresses[i].isDefault = false;
        }
      }
      
      // Limpar mainAddress
      user.mainAddress = undefined;
      
      await user.save();
      console.log(`   ✅ Salvo`);
      migratedCount++;
    }
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 Resultados:`);
    console.log(`   ✅ Migrados: ${migratedCount}`);
    console.log(`   ⏭️  Pulados: ${skippedCount}`);
    console.log(`   📊 Total: ${users.length}\n`);
    
  } catch (err) {
    console.error('❌ Erro:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

migrate();
