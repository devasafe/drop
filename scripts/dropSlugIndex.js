// Script para remover o índice único de slug da coleção stores
const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGO_URI;

async function dropSlugIndex() {
  await mongoose.connect(uri);
  try {
    const result = await mongoose.connection.db.collection('stores').dropIndex('slug_1');
    console.log('Índice slug_1 removido:', result);
  } catch (err) {
    console.error('Erro ao remover índice:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

dropSlugIndex();
