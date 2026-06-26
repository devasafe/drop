// frontend/components/OnboardingResumeBanner.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { getFlow } from '../lib/onboardingFlow';

// Retorna o path da 1ª etapa pendente do papel, ou null se nada pendente.
async function firstPendingPath(role?: string): Promise<string | null> {
  if (!role) return null;
  const flow = getFlow(role);
  if (flow.length === 0) return null;

  // Status agregado — reaproveita endpoints existentes.
  const ver = await api.get('/verification/me').then((r) => r.data?.verification).catch(() => null);
  const emailOk = ver?.email?.status === 'verified';
  const docOk = ver?.document?.status === 'approved';
  const identidadeOk = emailOk && docOk;

  let pixOk = false;
  try {
    const onb = await api.get('/onboarding/status').then((r) => r.data);
    pixOk = !!onb?.pixKey;
  } catch {}

  let lojaOk = false;
  if (role === 'lojista') {
    try {
      const dash = await api.get('/stores/dashboard').then((r) => r.data);
      const storeId = dash?.store?._id || dash?._id || dash?.storeId;
      if (storeId) {
        const sv = await api.get(`/verification/store/${storeId}`).then((r) => r.data);
        lojaOk = !!sv?.isVerified;
      }
    } catch {}
  }

  let motoboyOk = false;
  if (role === 'motoboy') {
    try {
      const mv = await api.get('/verification/motoboy/me').then((r) => r.data);
      motoboyOk = !!mv?.verified;
    } catch {}
  }

  const done: Record<string, boolean> = {
    identidade: identidadeOk,
    loja: lojaOk,
    motoboy: motoboyOk,
    pix: pixOk,
    plano: true, // plano é escolha, não bloqueia o banner
  };

  const pending = flow.find((s) => !done[s.key]);
  return pending ? pending.path : null;
}

export default function OnboardingResumeBanner() {
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.activeRole;
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    firstPendingPath(role).then((p) => { if (alive) setPath(p); });
    return () => { alive = false; };
  }, [role]);

  if (!path) return null;

  return (
    <div style={wrap}>
      <span style={{ fontSize: 14 }}>Sua conta ainda tem etapas pendentes.</span>
      <button style={btn} onClick={() => router.push(`${path}?onboarding=1`)}>
        Continuar configuração →
      </button>
    </div>
  );
}

const wrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  background: 'rgba(108,43,217,0.15)',
  border: '1px solid #6C2BD9',
  borderRadius: 12,
  padding: '12px 16px',
  margin: '0 0 16px',
  color: 'rgba(255,255,255,0.92)',
};
const btn: React.CSSProperties = {
  background: '#6C2BD9',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '8px 16px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
