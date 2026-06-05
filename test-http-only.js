const http = require('http');

const server = http.createServer((req, res) => {
  console.log('Request received:', req.method, req.url);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
});

console.log('About to listen on port 6666...');

server.listen(6666, 'localhost', () => {
  console.log('Server listening on port 6666');
  console.log('PID:', process.pid);
  console.log('Keeping process alive...');
});

server.on('error', (err) => {
  console.error('SERVER ERROR:', err.message, err.code);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message);
  process.exit(1);
});

// Keep process alive forever
setTimeout(() => {
  console.log('Process is still alive after 60 seconds');
}, 60000);
