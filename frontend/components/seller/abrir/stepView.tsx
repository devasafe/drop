// Ícone e texto de cada etapa do cadastro da loja (Abrir a loja e Agora "em análise").
import { Check, Clock, HelpCircle, TriangleAlert } from 'lucide-react';
import type { StepState } from '../../../lib/storeOnboarding';
import { rejectionLine } from '../../../lib/verificationRejection';
import blocks from '../../panel/PanelBlocks.module.css';

export const STEP_ICON_CLASS: Record<StepState, string> = { done: blocks.icoOk, review: blocks.icoWarn, rejected: blocks.icoErr, todo: '', unknown: '' };

export function stepStateIcon(state: StepState, index: number) {
  if (state === 'done') return <Check size={18} />;
  if (state === 'review') return <Clock size={18} />;
  if (state === 'rejected') return <TriangleAlert size={18} />;
  if (state === 'unknown') return <HelpCircle size={18} />;
  return <span>{index + 1}</span>;
}

export function stepSubText(s: { state: StepState; reason?: string; resend?: boolean; detail?: string }, doneText?: string) {
  if (s.state === 'rejected') return rejectionLine(s.reason, s.resend, { fallback: 'veja o que corrigir e envie de novo' });
  if (s.state === 'review') return 'Em análise';
  if (s.state === 'unknown') return 'Não deu para conferir agora';
  if (s.state === 'done' && doneText) return doneText;
  return s.detail || '';
}
