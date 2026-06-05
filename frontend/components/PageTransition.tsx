import { useRouter } from 'next/router';
import { useState, useEffect, useRef, ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

export default function PageTransition({ children }: PageTransitionProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fadeState, setFadeState] = useState<'in' | 'out'>('in');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleStart = (url: string) => {
      if (url !== router.asPath) {
        setLoading(true);
        setFadeState('out');
      }
    };

    const handleComplete = () => {
      setFadeState('in');
      // Keep progress bar visible briefly for visual polish
      timeoutRef.current = setTimeout(() => {
        setLoading(false);
      }, 300);
    };

    const handleError = () => {
      setFadeState('in');
      setLoading(false);
    };

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleComplete);
    router.events.on('routeChangeError', handleError);

    return () => {
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleComplete);
      router.events.off('routeChangeError', handleError);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [router]);

  return (
    <>
      {/* ── Slim top progress bar ── */}
      <div
        className={`drop-progress-bar ${loading ? 'drop-progress-bar--active' : ''}`}
        aria-hidden="true"
      />

      {/* ── Page content with fade transition ── */}
      <div className={`drop-page-transition drop-page-transition--${fadeState}`}>
        {children}
      </div>
    </>
  );
}
