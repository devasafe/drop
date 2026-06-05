// Script para inspecionar pedidos e mostrar os productId e nomes dos produtos
const mongoose = require('mongoose');
const Order = require('../src/models/Order');
const Product = require('../src/models/Product');

async function main() {
  await mongoose.connect('mongodb://localhost:27017/SEU_BANCO'); // ajuste o nome do banco
  const orders = await Order.find({}).lean();
  for (const order of orders) {
    console.log(`Pedido: ${order._id}`);
    if (Array.isArray(order.products)) {
      for (const item of order.products) {
        const prodId = item.productId;
        const prod = await Product.findById(prodId).lean();
        console.log(`  Produto: productId=${prodId} | Nome: ${prod ? prod.name : 'Produto removido'}`);
      }
    }
  }
  await mongoose.disconnect();
}

main().catch(console.error);