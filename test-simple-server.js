const http = require('http');
const express = require('express');

const app = express();
const server = http.createServer(app);

app.get('/test', (req, res) => {
  console.log('GET /test received');
  res.json({ ok: true, message: 'Server is working!' });
});

server.listen(5555, 'localhost', () => {
  console.log('Simple test server listening on port 5555');
  console.log('Process will now STAY OPEN...');
  console.log('PID:', process.pid);
});

server.on('error', (err) => {
  console.error('SERVER ERROR:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
  process.exit(1);
});

// Keep process alive
setInterval(() => {
  // noop
}, 1000);
