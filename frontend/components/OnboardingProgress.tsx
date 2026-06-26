// frontend/components/OnboardingProgress.tsx
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { getFlow, getStepIndexByPath } from '../lib/onboardingFlow';

export default function OnboardingProgress() {
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.activeRole;
  const onboarding = router.query.onboarding === '1';

  if (!onboarding) return null;
  const flow = getFlow(role);
  const idx = getStepIndexByPath(role, router.pathname);
  if (idx === -1 || flow.length === 0) return null;

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {flow.map((s, i) => (
          <span
            key={s.key}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: i <= idx ? '#6C2BD9' : 'rgba(255,255,255,0.12)',
            }}
          />
        ))}
      </div>
      <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
        Passo {idx + 1} de {flow.length} · <strong style={{ color: 'rgba(255,255,255,0.92)' }}>{flow[idx].label}</strong>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: 560,
  width: '100%',
  margin: '0 auto 4px',
  padding: '0 0 8px',
};
