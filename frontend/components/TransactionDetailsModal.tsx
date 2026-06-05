import React from 'react';
import Modal from './common/Modal';

export interface DetailRow {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  highlight?: 'success' | 'danger' | 'warning' | 'info' | 'neutral';
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  statusLabel?: string;
  statusTone?: 'pending' | 'released' | 'requested' | 'paid' | 'cancelled' | 'blocked' | 'credit' | 'debit';
  amount?: number;
  amountSign?: '+' | '-' | '';
  details: DetailRow[];
  footer?: React.ReactNode;
}

const toneColors: Record<string, { bg: string; fg: string }> = {
  pending:   { bg: 'rgba(245,158,11,0.15)', fg: '#F59E0B' },
  released:  { bg: 'rgba(59,130,246,0.15)', fg: '#3B82F6' },
  requested: { bg: 'rgba(139,92,246,0.15)', fg: '#8B5CF6' },
  paid:      { bg: 'rgba(34,197,94,0.15)',  fg: '#22C55E' },
  cancelled: { bg: 'rgba(239,68,68,0.15)',  fg: '#EF4444' },
  blocked:   { bg: 'rgba(239,68,68,0.2)',   fg: '#EF4444' },
  credit:    { bg: 'rgba(34,197,94,0.15)',  fg: '#22C55E' },
  debit:     { bg: 'rgba(239,68,68,0.15)',  fg: '#EF4444' },
};

const highlightColor: Record<string, string> = {
  success: '#22C55E',
  danger:  '#EF4444',
  warning: '#F59E0B',
  info:    '#3B82F6',
  neutral: 'var(--drop-text-light)',
};

export default function TransactionDetailsModal({
  isOpen,
  onClose,
  title,
  subtitle,
  statusLabel,
  statusTone,
  amount,
  amountSign = '',
  details,
  footer,
}: Props) {
  const tone = statusTone ? toneColors[statusTone] : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {(subtitle || statusLabel || amount != null) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 16, borderBottom: '1px solid var(--drop-border)' }}>
            {subtitle && (
              <div style={{ fontSize: 13, color: 'var(--drop-text-dim)' }}>{subtitle}</div>
            )}
            {amount != null && (
              <div style={{
                fontSize: 30,
                fontWeight: 800,
                color: amountSign === '-' ? '#EF4444' : amountSign === '+' ? '#22C55E' : 'var(--drop-white)',
                fontFamily: 'var(--drop-font-display)',
              }}>
                {amountSign}{amountSign ? ' ' : ''}R$ {amount.toFixed(2)}
              </div>
            )}
            {statusLabel && tone && (
              <span style={{
                alignSelf: 'flex-start',
                padding: '4px 12px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                background: tone.bg,
                color: tone.fg,
              }}>
                {statusLabel}
              </span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {details.map((d, i) => {
            // Section header: label sem valor
            if (d.value === '' || d.value == null) {
              return (
                <div
                  key={i}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 1,
                    color: d.highlight ? highlightColor[d.highlight] : 'var(--drop-text-dim)',
                    textTransform: 'uppercase',
                    paddingTop: i === 0 ? 0 : 8,
                    borderTop: i === 0 ? 'none' : '1px solid var(--drop-border)',
                    marginTop: i === 0 ? 0 : 4,
                  }}
                >
                  {d.label}
                </div>
              );
            }
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 12, color: 'var(--drop-text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>
                  {d.label}
                </span>
                <span style={{
                  fontSize: 13,
                  textAlign: 'right',
                  wordBreak: 'break-all',
                  fontFamily: d.mono ? 'monospace' : 'inherit',
                  color: d.highlight ? highlightColor[d.highlight] : 'var(--drop-white)',
                  fontWeight: d.highlight ? 700 : 500,
                }}>
                  {d.value}
                </span>
              </div>
            );
          })}
        </div>

        {footer && (
          <div style={{ paddingTop: 16, borderTop: '1px solid var(--drop-border)' }}>
            {footer}
          </div>
        )}
      </div>
    </Modal>
  );
}
