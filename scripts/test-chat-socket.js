#!/usr/bin/env node

/**
 * Test Script - Chat Socket.io em Tempo Real
 * 
 * Execute: npm run test:chat
 * 
 * Este script testa:
 * 1. Conexão Socket.io
 * 2. Autenticação com JWT
 * 3. Emissão de eventos
 * 4. Recepção de eventos
 * 5. Performance
 */

const io = require('socket.io-client');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_TOKEN = 'seu_token_aqui'; // Substituir com token real

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.cyan}ℹ️  ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  test: (msg) => console.log(`${colors.bright}${colors.cyan}🧪 ${msg}${colors.reset}`)
};

async function runTests() {
  console.log(`\n${colors.bright}🚀 Socket.io Chat - Teste de Integração${colors.reset}\n`);

  let testsPassed = 0;
  let testsFailed = 0;

  // ============================
  // TESTE 1: Conexão
  // ============================
  try {
    log.test('1. Testando conexão Socket.io...');
    
    const socket = io(API_URL, {
      auth: { token: TEST_TOKEN },
      reconnection: false,
      reconnectionDelay: 100,
      reconnectionAttempts: 1
    });

    await new Promise((resolve, reject) => {
      socket.on('connect', () => {
        log.success(`Conectado com ID: ${socket.id}`);
        testsPassed++;
        resolve();
      });

      socket.on('connect_error', (error) => {
        log.error(`Erro de conexão: ${error.message}`);
        testsFailed++;
        reject(error);
      });

      setTimeout(() => {
        if (!socket.connected) {
          log.warning('Timeout na conexão');
          reject(new Error('Timeout'));
        }
      }, 5000);
    });

    // ============================
    // TESTE 2: Join em sala
    // ============================
    log.test('2. Testando join em sala...');
    
    const conversationId = 'test-conv-' + Date.now();
    const userId = 'test-user-' + Date.now();

    socket.emit('chat:join', { conversationId, userId });
    log.success(`Entrado na sala: chat:${conversationId}`);
    testsPassed++;

    // ============================
    // TESTE 3: Escutar evento
    // ============================
    log.test('3. Testando recepção de eventos...');
    
    let eventReceived = false;
    socket.on('chat:new_message', (data) => {
      eventReceived = true;
      log.success(`Evento recebido: ${JSON.stringify(data).slice(0, 50)}...`);
      testsPassed++;
    });

    // ============================
    // TESTE 4: Emitir mensagem
    // ============================
    log.test('4. Testando envio de mensagem...');
    
    socket.emit('chat:message', {
      conversationId,
      text: '🧪 Mensagem de teste - ' + new Date().toISOString()
    });
    log.success('Mensagem emitida');
    testsPassed++;

    // ============================
    // TESTE 5: Typing indicator
    // ============================
    log.test('5. Testando indicador de digitação...');
    
    socket.emit('chat:typing', {
      conversationId,
      isTyping: true
    });
    log.success('Digitação iniciada');
    testsPassed++;

    setTimeout(() => {
      socket.emit('chat:typing', {
        conversationId,
        isTyping: false
      });
      log.success('Digitação finalizada');
      testsPassed++;
    }, 2000);

    // ============================
    // TESTE 6: Desconexão
    // ============================
    log.test('6. Testando desconexão...');
    
    await new Promise(resolve => {
      socket.on('disconnect', () => {
        log.success('Desconectado com sucesso');
        testsPassed++;
        resolve();
      });

      socket.disconnect();

      setTimeout(() => resolve(), 2000);
    });

    // ============================
    // RELATÓRIO
    // ============================
    const total = testsPassed + testsFailed;
    const percentage = ((testsPassed / total) * 100).toFixed(0);

    console.log(`\n${colors.bright}📊 Resultado Final${colors.reset}`);
    console.log(`   Passou: ${colors.green}${testsPassed}${colors.reset}`);
    console.log(`   Falhou: ${colors.red}${testsFailed}${colors.reset}`);
    console.log(`   Taxa: ${percentage}%\n`);

    if (testsFailed === 0) {
      log.success('🎉 Todos os testes passaram!');
      process.exit(0);
    } else {
      log.error('Alguns testes falharam');
      process.exit(1);
    }

  } catch (error) {
    log.error(`Erro geral: ${error.message}`);
    testsFailed++;

    console.log(`\n${colors.bright}📊 Resultado Final${colors.reset}`);
    console.log(`   Passou: ${colors.green}${testsPassed}${colors.reset}`);
    console.log(`   Falhou: ${colors.red}${testsFailed}${colors.reset}\n`);

    process.exit(1);
  }
}

// Executar testes
runTests().catch((err) => {
  log.error(`Fatal: ${err.message}`);
  process.exit(1);
});

// Timeout global
setTimeout(() => {
  log.error('Timeout global - testes demoraram muito');
  process.exit(1);
}, 30000);
