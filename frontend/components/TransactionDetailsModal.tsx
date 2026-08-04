import React from 'react';
import Modal from './common/Modal';
import { formatBRL } from './ui/PriceTag';
import styles from './TransactionDetailsModal.module.css';

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

const TONE_CLASS: Record<string, string> = {
  pending: styles.tonePending,
  released: styles.toneReleased,
  requested: styles.toneRequested,
  paid: styles.tonePaid,
  cancelled: styles.toneCancelled,
  blocked: styles.toneCancelled,
  credit: styles.tonePaid,
  debit: styles.toneCancelled,
};

const HL_CLASS: Record<string, string> = {
  success: styles.hlSuccess,
  danger: styles.hlDanger,
  warning: styles.hlWarning,
  info: styles.hlInfo,
  neutral: styles.hlNeutral,
};

export default function TransactionDetailsModal({
  isOpen, onClose, title, subtitle, statusLabel, statusTone, amount, amountSign = '', details, footer,
}: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <div className={styles.body}>
        {(subtitle || statusLabel || amount != null) && (
          <div className={styles.headerBlock}>
            {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
            {amount != null && (
              <div className={`${styles.amount} ${amountSign === '-' ? styles.amountNeg : amountSign === '+' ? styles.amountPos : ''}`}>
                {amountSign}{amountSign ? ' ' : ''}{formatBRL(amount)}
              </div>
            )}
            {statusLabel && statusTone && (
              <span className={`${styles.statusPill} ${TONE_CLASS[statusTone] || ''}`}>{statusLabel}</span>
            )}
          </div>
        )}

        <div className={styles.rows}>
          {details.map((d, i) => {
            if (d.value === '' || d.value == null) {
              return (
                <div key={i} className={`${styles.sectionHead} ${d.highlight ? HL_CLASS[d.highlight] : ''}`}>
                  {d.label}
                </div>
              );
            }
            return (
              <div key={i} className={styles.row}>
                <span className={styles.rowLabel}>{d.label}</span>
                <span className={`${styles.rowValue} ${d.mono ? styles.mono : ''} ${d.highlight ? HL_CLASS[d.highlight] : ''}`}>
                  {d.value}
                </span>
              </div>
            );
          })}
        </div>

        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </Modal>
  );
}
