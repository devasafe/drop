// frontend/components/OnboardingFooter.tsx
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { getNextStep, getFinalDestination, getStepIndexByPath } from '../lib/onboardingFlow';
import { Button } from './ui/Button';
import styles from './OnboardingFooter.module.css';

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
    <div className={styles.wrap}>
      {!isLast && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(getFinalDestination(role))}
        >
          Pular por agora →
        </Button>
      )}
      <Button variant="primary" onClick={go} className={styles.next}>
        {isLast ? finalLabel : 'Continuar →'}
      </Button>
    </div>
  );
}
