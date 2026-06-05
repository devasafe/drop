/*
Example Socket.IO client (Node.js)
Usage:
  node examples/socket-client.js <JWT>

It connects to the server and listens for 'notification' events.
*/

const { io } = require('socket.io-client');

const token = process.argv[2];
if (!token) {
  console.error('Usage: node examples/socket-client.js <JWT>');
  process.exit(1);
}

const socket = io('http://localhost:4000', {
  auth: { token }
});

socket.on('connect', () => {
  console.log('connected', socket.id);
});

socket.on('notification', (data) => {
  console.log('notification', data);
});

socket.on('connect_error', (err) => {
  console.error('connect_error', err.message);
});
