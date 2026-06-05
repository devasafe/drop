const axios = require('axios');

// Test motoboy wallet endpoint
async function testMotoboyWallet() {
  try {
    console.log('🔄 Iniciando teste...');
    
    // Primeiro, fazer login como motoboy
    const loginResponse = await axios.post('http://localhost:4000/api/auth/login', {
      email: 'mtb@mtb',
      password: 'mtb'
    });

    console.log('✅ Login bem-sucedido');
    const token = loginResponse.data.token;
    console.log('Token:', token.substring(0, 20) + '...');

    // Agora fazer a requisição ao endpoint de carteira
    console.log('\n🔄 Buscando carteira de motoboy...');
    const walletResponse = await axios.get(
      'http://localhost:4000/api/wallets/my-wallet/by-role/motoboy',
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    console.log('✅ Carteira carregada com sucesso:', walletResponse.data);
  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
    if (error.response?.status === 500) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testMotoboyWallet();
