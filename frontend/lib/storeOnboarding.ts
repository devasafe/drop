// Checklist "Abrir a loja" (D1). A ORDEM vem de lib/onboardingFlow.ts (fonte única, intocada);
// aqui só se calcula o estado de cada etapa a partir das rotas que já existem.
// Fail closed: leitura que falha deixa a etapa em 'unknown' ("não sabemos"), nunca em 'done'.
import api from './api';
import { getFlow, type OnboardingStep } from './onboardingFlow';
import type { SettlementMode } from '../hooks/useSaasConfig';

export type StepState = 'done' | 'review' | 'rejected' | 'todo' | 'unknown';
export interface ChecklistItem { key: string; label: string; state: StepState; detail?: string; reason?: string }
export interface ChecklistStep extends OnboardingStep {
  href: string;
  state: StepState;
  detail?: string;
  reason?: string;
  items?: ChecklistItem[];
}
export interface StoreOnboarding {
  mode: SettlementMode;
  store: any | null;
  productsCount: number;
  steps: ChecklistStep[];
  current: ChecklistStep | null;
  allSubmitted: boolean;
  approved: boolean;
}

/** Para onde cada etapa leva. Identidade abre DENTRO de /seller/abrir (a /verificacao é compartilhada). */
export const STEP_HREF: Record<string, string> = {
  loja: '/seller/create-store?onboarding=1',
  identidade: '/seller/abrir?etapa=identidade',
  lojaVerif: '/verificacao-loja?onboarding=1',
  pix: '/dados-recebimento?onboarding=1',
  plano: '/seller/select-plan?onboarding=1',
  asaas: '/seller/conta-asaas?onboarding=1',
};

const PLAN_NAME: Record<string, string> = { plan1: 'Vitrine', plan2: 'Pool de motoboys', plan3: 'Premium' };

function kyc(s?: string): StepState {
  if (s === 'approved' || s === 'verified') return 'done';
  if (s === 'pending') return 'review';
  if (s === 'rejected') return 'rejected';
  return 'todo';
}

function combine(items: ChecklistItem[]): StepState {
  if (items.some((i) => i.state === 'rejected')) return 'rejected';
  if (items.some((i) => i.state === 'unknown')) return 'unknown';
  if (items.every((i) => i.state === 'done')) return 'done';
  if (items.every((i) => i.state === 'done' || i.state === 'review')) return 'review';
  return 'todo';
}

/** Leitura que pode falhar: devolve o corpo ou null (null = "não sabemos"). */
const read = (url: string) => api.get(url).then((r) => r.data ?? null).catch(() => null);

export async function loadStoreOnboarding(mode: SettlementMode): Promise<StoreOnboarding> {
  const flow = getFlow('lojista', mode);
  // 404 = a loja ainda não existe (etapa 1 pendente). Outro erro sobe para a tela mostrar "Tentar de novo".
  const dash = await api.get('/stores/dashboard')
    .then((r) => r.data)
    .catch((e) => { if (e?.response?.status === 404) return null; throw e; });
  const store = dash?.store ?? null;
  const storeId = store?._id ? String(store._id) : null;
  const productsCount = Array.isArray(dash?.products) ? dash.products.length : 0;

  const custodia = mode !== 'direto';
  const [me, sv, onb, sub, asaasRaw] = await Promise.all([
    read('/verification/me'),
    storeId && custodia ? read(`/verification/store/${storeId}`) : Promise.resolve(null),
    custodia ? read('/onboarding/status') : Promise.resolve(null),
    storeId && custodia ? read('/settings/store-subscription') : Promise.resolve(null),
    storeId && !custodia ? read(`/stores/${storeId}/asaas`) : Promise.resolve(null),
  ]);
  const asaas = asaasRaw?.data ?? null;

  const ver = me?.verification;
  const identidadeItems: ChecklistItem[] = ver
    ? [
        { key: 'email', label: 'E-mail', state: ver.email?.status === 'verified' ? 'done' : 'todo' },
        { key: 'document', label: 'Documento', state: kyc(ver.document?.status), reason: ver.document?.rejectionReason },
      ]
    : [
        { key: 'email', label: 'E-mail', state: 'unknown' },
        { key: 'document', label: 'Documento', state: 'unknown' },
      ];
  const noData: StepState = store ? 'unknown' : 'todo';
  const lojaVerifItems: ChecklistItem[] = sv
    ? [
        { key: 'facial', label: 'Foto do rosto', state: kyc(sv.facial?.status), reason: sv.facial?.rejectionReason },
        { key: 'cnpj', label: 'CNPJ', state: kyc(sv.cnpj?.status), reason: sv.cnpj?.rejectionReason, detail: sv.cnpj?.razaoSocial },
        { key: 'address', label: 'Comprovante de endereço', state: kyc(sv.address?.status), reason: sv.address?.rejectionReason },
      ]
    : [
        { key: 'facial', label: 'Foto do rosto', state: noData },
        { key: 'cnpj', label: 'CNPJ', state: noData },
        { key: 'address', label: 'Comprovante de endereço', state: noData },
      ];

  const steps: ChecklistStep[] = flow.map((s) => {
    const base = { ...s, href: STEP_HREF[s.key] ?? `${s.path}?onboarding=1` };
    switch (s.key) {
      case 'loja': {
        const where = store?.street ? `${store.street}${store.number ? `, ${store.number}` : ''}` : '';
        return { ...base, state: store ? 'done' : 'todo', detail: store ? [store.name, where].filter(Boolean).join(' · ') : 'Nome e endereço da loja' };
      }
      case 'identidade': {
        const st = combine(identidadeItems);
        return {
          ...base, state: st, items: identidadeItems,
          detail: st === 'done' ? 'E-mail e documento aprovados' : 'E-mail e documento do dono',
          reason: identidadeItems.find((i) => i.state === 'rejected')?.reason,
        };
      }
      case 'lojaVerif': {
        const st = combine(lojaVerifItems);
        return {
          ...base, state: st, items: lojaVerifItems,
          detail: 'CNPJ, foto do rosto e comprovante',
          reason: lojaVerifItems.find((i) => i.state === 'rejected')?.reason,
        };
      }
      case 'pix': {
        // A chave vem MASCARADA do servidor: serve só para exibir, nunca como valor real.
        const st: StepState = !onb ? 'unknown' : onb.hasPixKey ? 'done' : 'todo';
        return { ...base, state: st, detail: st === 'done' ? `Chave ${onb.pixKey ?? ''}`.trim() : 'Chave Pix para seus saques' };
      }
      case 'plano': {
        const st: StepState = !store ? 'todo' : !sub ? 'unknown' : sub.currentPlan ? 'done' : 'todo';
        return { ...base, state: st, detail: sub?.currentPlan ? PLAN_NAME[sub.currentPlan] ?? 'Plano escolhido' : 'Vitrine, Pool ou Premium' };
      }
      case 'asaas': {
        const st: StepState = !store
          ? 'todo'
          : !asaas
            ? 'unknown'
            : asaas.status === 'valid' && asaas.consent ? 'done' : asaas.status === 'invalid' ? 'rejected' : 'todo';
        return {
          ...base, state: st,
          detail: st === 'done' ? `Conta conectada · chave ••••${asaas?.apiKeyLast4 ?? ''}` : 'Termo, chave e 2 ajustes no Asaas',
          reason: st === 'rejected' ? 'Chave recusada pelo Asaas' : undefined,
        };
      }
      default:
        return { ...base, state: 'todo' as StepState };
    }
  });

  const current = steps.find((s) => s.state !== 'done' && s.state !== 'review') ?? null;
  const allSubmitted = steps.every((s) => s.state === 'done' || s.state === 'review');
  const approved = custodia
    ? !!store?.isVerified && steps.every((s) => s.state === 'done')
    : steps.every((s) => s.state === 'done');

  return { mode, store, productsCount, steps, current, allSubmitted, approved };
}
