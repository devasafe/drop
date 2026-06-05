import dotenv from 'dotenv';
dotenv.config();

// ✅ VALIDAR ENV NO STARTUP (falha rápido com mensagens claras)
import env from './config/env';

import http from 'http';
import app from './app';
import { connectDB } from './db';
import notifier from './services/notifier';
import { startDeliveryTimeoutJob } from './jobs/deliveryTimeout.job';

console.log('📍 [INDEX] Starting application...');

connectDB().then(() => {
  console.log('✅ [INDEX] Database connected');
  const server = http.createServer(app);
  console.log('✅ [INDEX] HTTP server created');

  // Error handlers ANTES de qualquer coisa
  server.on('error', (err: any) => {
    console.error('❌ [SERVER ERROR]', err.message, err.code);
    // Não fazer exit aqui, pode ser erro de conexão específica
  });

  server.on('clientError', (err: any, socket) => {
    console.error('❌ [CLIENT ERROR]', err.message);
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  // initialize Socket.IO on the HTTP server (notifier handles initialization)
  try {
    console.log('📍 [INDEX] Initializing Socket.IO...');
    notifier.initSocket(server);
    console.log('✅ [INDEX] Socket.IO initialized');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('⚠️ Socket.IO initialization skipped or failed', e);
  }

  // ✅ FIX #5: Inicializar job de timeout para motoboy não-responsivo
  try {
    console.log('📍 [INDEX] Starting delivery timeout job...');
    startDeliveryTimeoutJob();
    console.log('✅ [INDEX] Delivery timeout job started');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('⚠️ Delivery timeout job failed to start', e);
  }

  console.log(`📍 [INDEX] Calling server.listen(${env.PORT})...`);
  
  server.listen(env.PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${env.PORT} (${env.NODE_ENV} mode)`);
    console.log(`✅ [INDEX] Server fully initialized and listening on 0.0.0.0:${env.PORT}`);
    console.log('📍 [INDEX] Keeping process alive...');
    
    // Manter processo vivo
    setInterval(() => {
      // noop
    }, 1000);
  });
  
  server.on('error', (err: any) => {
    console.error('❌ [INDEX] Server error:', err.message, err.code);
    // Não fazer exit aqui, pode ser erro de conexão específica
  });

}).catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ [INDEX] Failed to connect to DB', err);
  process.exit(1);
});
