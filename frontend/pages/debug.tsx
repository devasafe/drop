import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import Nav from '../components/Nav';

export default function DebugPage() {
  const auth = useAuth();

  return (
    <>
      <Nav />
      <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
        <h1>🐛 Página de Debug</h1>
        
        <div style={{
          background: '#f3f4f6',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontFamily: 'monospace',
          fontSize: '14px',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all'
        }}>
          {JSON.stringify(auth, null, 2)}
        </div>

        <div style={{
          background: '#e0e7ff',
          padding: '20px',
          borderRadius: '8px',
          borderLeft: '4px solid #667eea',
          color: '#3730a3'
        }}>
          <p><strong>Status:</strong></p>
          <ul>
            <li>Carregando: {auth?.loading ? 'Sim' : 'Não'}</li>
            <li>Usuário: {auth?.user ? 'Sim' : 'Não'}</li>
            <li>Token: {auth?.token ? 'Sim' : 'Não'}</li>
            {auth?.user && (
              <>
                <li>Nome: {auth.user.name}</li>
                <li>Email: {auth.user.email}</li>
                <li>Role: {auth.user.role}</li>
                <li>Active Role: {auth.user.activeRole}</li>
              </>
            )}
          </ul>
        </div>

        <div style={{ marginTop: '20px' }}>
          <p>
            <a href="/admin/wallets" style={{ color: '#667eea', textDecoration: 'underline' }}>
              → Ir para /admin/wallets
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
