// frontend/components/OnboardingFooter.tsx
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { getNextStep, getFinalDestination, getStepIndexByPath } from '../lib/onboardingFlow';

export default function OnboardingFooter() {
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.activeRole;
  const onboarding = router.query.onboarding === '1';

  if (!onboarding) return null;
  if (getStepIndexByPath(role, router.pathname) === -1) return null;

  const next = getNextStep(role, router.pathname);
  const isLast = !next;
  const finalLabel = role === 'cliente' ? 'Ir para o app →' : 'Ir para o painel →';

  const go = () => {
    if (next) router.push(`${next.path}?onboarding=1`);
    else router.push(getFinalDestination(role));
  };

  return (
    <div style={wrap}>
      {!isLast && (
        <button style={skipBtn} onClick={() => router.push(getFinalDestination(role))}>
          Pular por agora →
        </button>
      )}
      <button style={primaryBtn} onClick={go}>
        {isLast ? finalLabel : 'Continuar →'}
      </button>
    </div>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: 560,
  width: '100%',
  margin: '20px auto 40px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
};
const skipBtn: React.CSSProperties = {
  background: 'transparent',
  color: 'rgba(255,255,255,0.5)',
  border: 'none',
  fontSize: 14,
  cursor: 'pointer',
};
const primaryBtn: React.CSSProperties = {
  background: '#6C2BD9',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '12px 22px',
  fontWeight: 600,
  fontSize: 15,
  cursor: 'pointer',
  marginLeft: 'auto',
};
