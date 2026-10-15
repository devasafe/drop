import api from './api';

/** Estado do cadastro do motoboy (D2 · /motoboy/cadastro e Perfil). A etapa sai sempre do servidor. */
export type KycKey = 'email' | 'document' | 'facial' | 'courier';
export type KycState = 'done' | 'pending' | 'rejected' | 'todo';
export interface KycItem { key: KycKey; label: string; state: KycState; reason?: string }
export interface CadastroState { items: KycItem[]; verified: boolean; hasPixKey: boolean; pixKey: string | null }
export type CadastroEtapa = 'conta' | 'verificacao' | 'recebimento' | 'analise' | 'pronto';

const fromStatus = (s: unknown): KycState =>
  s === 'approved' ? 'done' : s === 'pending' ? 'pending' : s === 'rejected' ? 'rejected' : 'todo';

/** Os 4 itens do KYC do motoboy (CLAUDE.md: e-mail + documento + facial + CNH/placa), na ordem do protótipo. */
export function kycItems(verMe: any, motoboyMe: any): KycItem[] {
  const v = verMe?.verification || {};
  const doc = v.document || {};
  const facial = motoboyMe?.facial || {};
  const courier = motoboyMe?.courier || {};
  return [
    { key: 'email', label: 'E-mail', state: v.email?.status === 'verified' ? 'done' : 'todo' },
    { key: 'document', label: 'Documento', state: fromStatus(doc.status), reason: doc.rejectionReason || undefined },
    { key: 'facial', label: 'Selfie', state: fromStatus(facial.status), reason: facial.rejectionReason || undefined },
    { key: 'courier', label: 'CNH e placa', state: fromStatus(courier.status), reason: courier.rejectionReason || undefined },
  ];
}

export function cadastroStateFrom(verMe: any, motoboyMe: any, onboarding: any): CadastroState {
  const pixKey = typeof onboarding?.pixKey === 'string' && onboarding.pixKey ? onboarding.pixKey : null;
  return {
    items: kycItems(verMe, motoboyMe),
    verified: motoboyMe?.verified === true,
    hasPixKey: onboarding?.hasPixKey === true || !!pixKey,
    pixKey,
  };
}

/** Lê as três rotas. Qualquer falha rejeita: a tela mostra "Tentar de novo", nunca uma etapa presumida. */
export async function loadCadastroState(): Promise<CadastroState> {
  const [v, m, o] = await Promise.all([
    api.get('/verification/me'),
    api.get('/verification/motoboy/me'),
    api.get('/onboarding/status'),
  ]);
  return cadastroStateFrom(v.data, m.data, o.data);
}

/** Etapa de quem já tem conta. Enviado (em análise) conta como feito; recusado volta para a verificação. */
export function etapaAtual(s: CadastroState): Exclude<CadastroEtapa, 'conta'> {
  const allSent = s.items.every((i) => i.state === 'done' || i.state === 'pending');
  if (!allSent) return 'verificacao';
  if (!s.hasPixKey) return 'recebimento';
  return s.verified ? 'pronto' : 'analise';
}

export const ETAPA_NUMERO = { conta: 1, verificacao: 2, recebimento: 3, analise: 4 } as const;

/** Item que abre sozinho na Verificação: o recusado primeiro (protótipo 10), senão o primeiro que falta. */
export function proximoItemAberto(items: KycItem[]): KycKey | null {
  return (items.find((i) => i.state === 'rejected') ?? items.find((i) => i.state === 'todo'))?.key ?? null;
}

const FALTA_LABEL: Record<KycKey, string> = { email: 'e-mail', document: 'documento', facial: 'selfie', courier: 'CNH e placa' };

export interface KycSummary { tone: 'ok' | 'warn' | 'err' | 'info'; title: string; sub: string; action: 'refazer' | 'continuar' | null }

/** Uma linha de resumo para o Perfil. */
export function kycSummary(items: KycItem[], verified: boolean): KycSummary {
  if (verified) return { tone: 'ok', title: 'Verificação completa', sub: 'Documento, selfie, CNH e placa', action: null };
  const rejected = items.find((i) => i.state === 'rejected');
  if (rejected) return { tone: 'err', title: 'Verificação recusada', sub: `${rejected.label}: ${rejected.reason || 'envie de novo'}`, action: 'refazer' };
  const todo = items.filter((i) => i.state === 'todo');
  if (todo.length) return { tone: 'warn', title: 'Verificação pendente', sub: `Falta: ${todo.map((i) => FALTA_LABEL[i.key]).join(', ')}`, action: 'continuar' };
  return { tone: 'info', title: 'Verificação em análise', sub: 'A equipe confere em até 1 dia útil', action: null };
}
