/**
 * Socket listener melhorado com timeout maior
 */

const io = require('socket.io-client');
const fs = require('fs');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  event: (msg) => console.log(`${colors.yellow}→${colors.reset} ${colors.cyan}${msg}${colors.reset}`),
};

// Ler token do arquivo gerado pelo teste anterior
let token = process.argv[2];
if (!process.argv[2]) {
  try {
    const tokenFile = fs.readFileSync('d:\\PROJETOS\\Drop\\test-token.txt', 'utf8');
    const lines = tokenFile.split('\n');
    token = lines[0].split('=')[1];
  } catch (e) {
    log.error('Token não fornecido e arquivo de token não encontrado!');
    log.error('Use: node test-socket-listen.js <TOKEN>');
    process.exit(1);
  }
}

log.info(`Conectando ao servidor na porta 4000...`);
log.info(`Token: ${token.substring(0, 30)}...\n`);

const socket = io('http://localhost:4000', {
  auth: { token },
  transports: ['websocket'],
});

const capturedEvents = [];

socket.on('connect', () => {
  log.success(`Conectado ao servidor WebSocket`);
  console.log(`   Socket ID: ${socket.id}\n`);
});

socket.on('connect_error', (err) => {
  log.error(`Erro de conexão: ${err.message}`);
});

socket.on('disconnect', (reason) => {
  log.info(`Desconectado: ${reason}`);
});

// Capture TODOS os eventos
socket.onAny((eventName, ...args) => {
  const timestamp = new Date().toLocaleTimeString();
  log.event(`[${timestamp}] "${eventName}"`);
  
  if (args.length > 0      ) {
    const data = JSON.stringify(args[0], null, 2);
    const lines = data.split('\n').slice(0, 8);
    console.log(`   ${lines.join('\n   ')}`);
  }
  
  capturedEvents.push({ event: eventName, time: timestamp });
});

// Timeout de 60 segundos
const timeout = setTimeout(() => {
  log.info(`Teste finalizado após 60 segundos. Resumo:`);
  console.log(`\n${colors.cyan}Eventos capturados: ${capturedEvents.length}${colors.reset}`);
  
  if (capturedEvents.length > 0) {
    log.success(`Eventos:`);
    capturedEvents.forEach((e) => {
      console.log(`  - ${e.event} (${e.time})`);
    });
  } else {
    log.error('NENHUM evento capturado!');
  }
  
  console.log();
  socket.disconnect();
  process.exit(0);
}, 60000);

log.info(`Escutando eventos... (timeout em 60s)\n`);
