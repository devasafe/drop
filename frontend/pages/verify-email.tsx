import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import api from '../lib/api';

export default function VerifyEmailPage() {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verificando seu email...');

  useEffect(() => {
    if (!router.isReady) return;
    const token = router.query.token as string | undefined;
    if (!token) {
      setState('error');
      setMessage('Link inválido: token ausente.');
      return;
    }
    api
      .post('/verification/email/verify', { token })
      .then(() => {
        setState('success');
        setMessage('Email verificado com sucesso!');
      })
      .catch((err) => {
        setState('error');
        setMessage(err?.response?.data?.error || 'Não foi possível verificar o email.');
      });
  }, [router.isReady, router.query.token]);

  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', margin: 0, marginBottom: 16 }}>
          {state === 'success' ? '✅' : state === 'error' ? '⚠️' : '⏳'} Verificação de email
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.7)' }}>{message}</p>
        <Link href="/verificacao" style={btn}>Ir para a verificação da conta</Link>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minHeight: '100vh', background: '#0A0A0A', color: 'rgba(255,255,255,0.92)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
};
const card: React.CSSProperties = {
  background: '#161616', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16,
  padding: 32, maxWidth: 420, width: '100%', textAlign: 'center',
};
const btn: React.CSSProperties = {
  display: 'inline-block', marginTop: 20, background: '#6C2BD9', color: '#fff',
  padding: '10px 18px', borderRadius: 10, textDecoration: 'none', fontWeight: 600,
};
