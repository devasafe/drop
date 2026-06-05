import { CSSProperties } from 'react';

type SkeletonVariant = 'cards' | 'list' | 'detail' | 'form' | 'dashboard';

interface LoadingSkeletonProps {
  variant?: SkeletonVariant;
  count?: number;
  columns?: string;
}

function SkeletonCard({ delay, imgHeight = 200 }: { delay: number; imgHeight?: number }) {
  return (
    <div
      className="drop-skeleton-card"
      style={{
        animationDelay: `${delay}s`,
        animation: 'drop-card-enter 0.5s cubic-bezier(0.4,0,0,1) both',
      }}
    >
      <div className="drop-skeleton-img" style={{ height: imgHeight }} />
      <div style={{ padding: '4px 0' }}>
        <div className="drop-skeleton-line" />
        <div className="drop-skeleton-line" />
        <div className="drop-skeleton-line" />
        <div className="drop-skeleton-line" />
      </div>
    </div>
  );
}

function SkeletonRow({ delay }: { delay: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 20px',
        background: 'var(--drop-surface)',
        border: '1px solid var(--drop-border)',
        borderRadius: 'var(--drop-radius-lg)',
        animationDelay: `${delay}s`,
        animation: 'drop-card-enter 0.5s cubic-bezier(0.4,0,0,1) both',
      }}
    >
      <div className="drop-skeleton" style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div className="drop-skeleton" style={{ height: 14, width: '60%', marginBottom: 8 }} />
        <div className="drop-skeleton" style={{ height: 12, width: '40%' }} />
      </div>
      <div className="drop-skeleton" style={{ width: 72, height: 32, borderRadius: 8 }} />
    </div>
  );
}

function SkeletonDetail({ delay }: { delay: number }) {
  return (
    <div
      style={{
        maxWidth: 800,
        margin: '0 auto',
        animationDelay: `${delay}s`,
        animation: 'drop-card-enter 0.5s cubic-bezier(0.4,0,0,1) both',
      }}
    >
      <div className="drop-skeleton" style={{ height: 240, borderRadius: 'var(--drop-radius-lg)', marginBottom: 24 }} />
      <div className="drop-skeleton" style={{ height: 24, width: '50%', marginBottom: 12 }} />
      <div className="drop-skeleton" style={{ height: 14, width: '80%', marginBottom: 8 }} />
      <div className="drop-skeleton" style={{ height: 14, width: '65%', marginBottom: 24 }} />
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="drop-skeleton" style={{ height: 40, width: 120, borderRadius: 8 }} />
        <div className="drop-skeleton" style={{ height: 40, width: 120, borderRadius: 8 }} />
      </div>
    </div>
  );
}

function SkeletonDashboard({ delay }: { delay: number }) {
  return (
    <div
      style={{
        animationDelay: `${delay}s`,
        animation: 'drop-card-enter 0.5s cubic-bezier(0.4,0,0,1) both',
      }}
    >
      {/* Stat cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            style={{
              background: 'var(--drop-surface)',
              border: '1px solid var(--drop-border)',
              borderRadius: 'var(--drop-radius-lg)',
              padding: 24,
              animationDelay: `${i * 0.06}s`,
              animation: 'drop-card-enter 0.5s cubic-bezier(0.4,0,0,1) both',
            }}
          >
            <div className="drop-skeleton" style={{ height: 12, width: '50%', marginBottom: 12 }} />
            <div className="drop-skeleton" style={{ height: 28, width: '70%', marginBottom: 6 }} />
            <div className="drop-skeleton" style={{ height: 10, width: '40%' }} />
          </div>
        ))}
      </div>
      {/* Table skeleton */}
      <div style={{ background: 'var(--drop-surface)', border: '1px solid var(--drop-border)', borderRadius: 'var(--drop-radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: 'var(--drop-bg-3)' }}>
          <div className="drop-skeleton" style={{ height: 12, width: '30%' }} />
        </div>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ padding: '14px 16px', borderBottom: '1px solid var(--drop-border)', display: 'flex', gap: 16, alignItems: 'center' }}>
            <div className="drop-skeleton" style={{ height: 14, width: '25%' }} />
            <div className="drop-skeleton" style={{ height: 14, width: '20%' }} />
            <div className="drop-skeleton" style={{ height: 14, width: '15%' }} />
            <div className="drop-skeleton" style={{ height: 14, flex: 1 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonForm({ delay }: { delay: number }) {
  return (
    <div
      style={{
        maxWidth: 600,
        margin: '0 auto',
        animationDelay: `${delay}s`,
        animation: 'drop-card-enter 0.5s cubic-bezier(0.4,0,0,1) both',
      }}
    >
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ marginBottom: 20 }}>
          <div className="drop-skeleton" style={{ height: 12, width: '25%', marginBottom: 8 }} />
          <div className="drop-skeleton" style={{ height: 42, width: '100%', borderRadius: 8 }} />
        </div>
      ))}
      <div className="drop-skeleton" style={{ height: 44, width: 140, borderRadius: 8, marginTop: 16 }} />
    </div>
  );
}

export default function LoadingSkeleton({ variant = 'cards', count = 6, columns }: LoadingSkeletonProps) {
  if (variant === 'detail') {
    return (
      <div style={{ padding: '40px 24px' }}>
        <SkeletonDetail delay={0} />
      </div>
    );
  }

  if (variant === 'dashboard') {
    return (
      <div style={{ padding: '40px 24px', maxWidth: 1400, margin: '0 auto' }}>
        <div className="drop-skeleton" style={{ height: 28, width: '30%', marginBottom: 8 }} />
        <div className="drop-skeleton" style={{ height: 14, width: '20%', marginBottom: 32 }} />
        <SkeletonDashboard delay={0.05} />
      </div>
    );
  }

  if (variant === 'form') {
    return (
      <div style={{ padding: '40px 24px' }}>
        <div className="drop-skeleton" style={{ height: 28, width: '40%', marginBottom: 8 }} />
        <div className="drop-skeleton" style={{ height: 14, width: '25%', marginBottom: 32 }} />
        <SkeletonForm delay={0.05} />
      </div>
    );
  }

  if (variant === 'list') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonRow key={i} delay={i * 0.06} />
        ))}
      </div>
    );
  }

  // default: cards
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: columns || 'repeat(auto-fill, minmax(260px, 1fr))',
      gap: 20,
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} delay={i * 0.06} />
      ))}
    </div>
  );
}
