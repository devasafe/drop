// frontend/components/OnboardingProgress.tsx
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { getFlow, getStepIndexByPath } from '../lib/onboardingFlow';
import styles from './OnboardingProgress.module.css';

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
    <div className={styles.wrap}>
      <p className={styles.caption}>
        Passo {idx + 1} de {flow.length}
      </p>
      <ol className={styles.track}>
        {flow.map((s, i) => {
          const state = i < idx ? 'done' : i === idx ? 'current' : 'pending';
          return (
            <li key={s.key} className={styles.step} data-state={state}>
              <span className={styles.dot} aria-hidden="true">
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span className={styles.label}>{s.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
