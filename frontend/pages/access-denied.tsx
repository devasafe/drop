import Link from 'next/link';
import React from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function AccessDenied() {
  const { user } = useAuth() || {};
  const activeRole = user?.activeRole || user?.role || 'cliente';

  const roleLabel = () => {
    switch (activeRole) {
      case 'cliente': return 'Cliente';
      case 'lojista': return 'Lojista';
      case 'motoboy': return 'Motoboy';
      default: return activeRole;
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A0A0A',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{
        maxWidth: '520px',
        width: '100%',
        textAlign: 'center',
        animation: 'drop-fade-in 0.5s cubic-bezier(0.4,0,0,1) both',
      }}>
        {/* Icon */}
        <div style={{
          width: '72px', height: '72px',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: '20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
        </div>

        <h1 style={{ margin: '0 0 12px 0', fontSize: '30px', fontWeight: 800, color: '#fff', fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>
          Acesso Negado
        </h1>
        <p style={{ margin: '0 0 8px 0', fontSize: '15px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
          Você não tem permissão para acessar esta página.
        </p>
        <p style={{ margin: '0 0 28px 0', fontSize: '14px', color: 'rgba(255,255,255,0.35)' }}>
          Role atual: <span style={{ color: '#A78BFA', fontWeight: 600 }}>{roleLabel()}</span>
        </p>

        {/* Tip */}
        <div style={{
          background: 'rgba(108,43,217,0.1)',
          border: '1px solid rgba(139,92,246,0.2)',
          borderRadius: '14px',
          padding: '16px 20px',
          marginBottom: '28px',
          textAlign: 'left',
        }}>
          <p style={{ margin: 0, fontSize: '13px', color: 'rgba(167,139,250,0.8)', lineHeight: 1.6 }}>
            <span style={{ fontWeight: 700, color: '#A78BFA' }}>Dica: </span>
            Se você tem múltiplos roles, use o menu de usuário na navbar para trocar e acessar a página correta.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/inicio" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #6C2BD9, #8B5CF6)',
            color: '#fff',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 700,
            textDecoration: 'none',
            transition: 'all 0.2s',
            fontFamily: 'Inter, sans-serif',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 24px rgba(108,43,217,0.4)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}>
            ← Voltar ao Início
          </Link>
          {user?.roles && user.roles.length > 1 && (
            <Link href="/inicio" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '12px 24px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.6)',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.2s',
              fontFamily: 'Inter, sans-serif',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)'; e.currentTarget.style.color = '#A78BFA'; e.currentTarget.style.background = 'rgba(108,43,217,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.background = 'transparent'; }}>
              Trocar Role
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
