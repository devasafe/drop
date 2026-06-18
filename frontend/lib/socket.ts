import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * NEXT_PUBLIC_API_URL inclui o sufixo /api (ex: http://localhost:4000/api),
 * mas o socket.io-client interpreta o pathname como NAMESPACE. Se passarmos
 * "http://host/api", ele tenta conectar no namespace "/api" — que o servidor
 * não registrou, resultando em "Invalid namespace". Removemos o /api para
 * conectar no namespace default "/".
 */
const getSocketUrl = () => {
  if (typeof window === 'undefined') {
    // Server-side
    return 'https://api.dropapp.com.br';
  }
  
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Development local
    return 'http://localhost:4000';
  }
  
  // Production
  return 'https://api.dropapp.com.br';
};

export const connectSocket = (_token?: string) => {
  if (socket) return socket;
  // Autentica via cookie httpOnly enviado no handshake (withCredentials).
  socket = io(getSocketUrl(), { withCredentials: true });
  return socket;
};

export const disconnectSocket = () => {
  if (socket) socket.disconnect();
  socket = null;
};

export const getSocket = () => socket;

export default { connectSocket, disconnectSocket, getSocket };
