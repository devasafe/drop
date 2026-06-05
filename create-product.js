#!/usr/bin/env node

/**
 * Script para criar um produto de teste
 */

const axios = require('axios');

const API_BASE = 'http://localhost:4000/api';

async function createProduct() {
  try {
    const productData = {
      name: 'Test Product',
      description: 'Produto de teste para o sistema',
      price: 50.00,
      quantity: 100,
      category: 'test'
    };

    // Login como admin/ceo para criar produto
    const loginRes = await axios.post(`${API_BASE}/auth/login`, {
      email: 'ceo@ceo',
      password: 'ceo'
    });

    const token = loginRes.data.token;

    // Criar produto
    const productRes = await axios.post(`${API_BASE}/products`, productData, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('✅ Produto criado com sucesso!');
    console.log(`Product ID: ${productRes.data._id}`);
    console.log(`Name: ${productRes.data.name}`);
    console.log(`Price: R$ ${productRes.data.price}`);
    console.log('\n✅ Use este ID nos testes!');
    console.log(`productId: '${productRes.data._id}'`);

  } catch (err) {
    console.error('❌ Erro ao criar produto:', err.response?.data?.error || err.message);
    
    // Se produto já existe, tentar listar produtos
    try {
      console.log('\n📋 Produtos existentes:');
      const listRes = await axios.get(`${API_BASE}/products`);
      listRes.data.forEach((p, i) => {
        console.log(`${i + 1}. ${p.name} (ID: ${p._id}) - R$ ${p.price}`);
      });
    } catch (err2) {
      console.error('Erro ao listar produtos:', err2.message);
    }
  }
}

createProduct();
