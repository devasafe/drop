/**
 * Fila de verificações do admin (D3a · P3.2, telas 2 e 9; D3b-2b · P3.1): junta as três filas do servidor por
 * pessoa, com a MESMA regra da página antiga (pages/admin/verificacoes.tsx em 91a9597), e descreve cada item
 * pendente com as rotas de aprovar/recusar, a permissão da rota, o alvo (userId ou storeId) e a data de envio.
 * D3b-2b: motivos padronizados da recusa (os mesmos de src/services/verification/rejectReasons.ts), "há quanto
 * tempo espera", média de espera e "Aprovar tudo" pela rota única do servidor (uma chamada por sujeito).
 */
import { isConflictWithCode, isHttpStatus } from './adminErrors';
import { ageLabel } from './adminOps';

export type PersonKind = 'lojista' | 'motoboy' | 'cliente';
export type VerificationKind = 'document' | 'facial' | 'courier' | 'cnpj' | 'address';

/** Permissão de cada rota (src/routes/verification.ts): leitura da fila e decisão do item. */
export const VERIFICATION_PERMISSIONS = {
  clients: 'verification:review_clients',
  stores: 'verification:review_stores',
  motoboys: 'verification:review_motoboys',
} as const;

export const PERSON_KIND_LABEL: Record<PersonKind, string> = { lojista: 'Loja', motoboy: 'Motoboy', cliente: 'Cliente' };

export interface VerificationImage { url: string; label: string }

export interface VerificationItem {
  key: string;
  kind: VerificationKind;
  label: string;
  detail: string;
  images: VerificationImage[];
  approveUrl: string;
  rejectUrl: string;
  permission: string;
  /** userId (documento, selfie, CNH e placa) ou storeId (CNPJ, endereço). */
  targetId: string;
  /** Quando a pessoa enviou (ISO); null quando o servidor não gravou (CNPJ enviado antes da D3b-2b). */
  submittedAt: string | null;
}

export interface VerificationPerson {
  id: string;
  name: string;
  email?: string;
  kind: PersonKind;
  storeNames: string[];
  items: VerificationItem[];
}

// As filas vêm do servidor como JSON livre (campos `verification` em JSONB).
type Raw = Record<string, any>;

export interface VerificationLists { docs: Raw[]; stores: Raw[]; facialOwners: Raw[]; motoboys: Raw[] }

interface Agg {
  id: string;
  name: string;
  email?: string;
  roles: string[];
  doc?: Raw | null;
  facial?: Raw | null;
  courier?: Raw | null;
  stores: Raw[];
}

/** Endereço estruturado da loja para conferir contra o comprovante. */
export function formatStoreAddress(s: Raw): string {
  const linha1 = [s.street, s.number].filter(Boolean).join(', ');
  const linha2 = [s.neighborhood, s.city, s.state].filter(Boolean).join(' · ');
  const cep = s.zip ? `CEP ${s.zip}` : '';
  return [linha1, linha2, cep].filter(Boolean).join(' — ') || (s.address || '');
}

const imagesOf = (pairs: [unknown, string][]): VerificationImage[] =>
  pairs
    .filter(([url]) => typeof url === 'string' && url !== '')
    .map(([url, label]) => ({ url: url as string, label }));

const isoOrNull = (v: unknown): string | null => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);

function itemsOf(u: Agg, kind: PersonKind): VerificationItem[] {
  const items: VerificationItem[] = [];
  const P = VERIFICATION_PERMISSIONS;
  if (u.doc && u.doc.status === 'pending') {
    items.push({
      key: `document:${u.id}`,
      kind: 'document',
      label: 'Documento',
      detail: `Tipo: ${String(u.doc.type || '-').toUpperCase()} · Nº ${u.doc.number || '-'}`,
      images: imagesOf([[u.doc.frontUrl, 'Frente'], [u.doc.backUrl, 'Verso']]),
      approveUrl: `/verification/admin/${u.id}/approve`,
      rejectUrl: `/verification/admin/${u.id}/reject`,
      permission: P.clients,
      targetId: u.id,
      submittedAt: isoOrNull(u.doc.submittedAt),
    });
  }
  // A página antiga mostrava só o documento do cliente.
  if (kind === 'cliente') return items;
  if (u.facial && u.facial.status === 'pending') {
    items.push({
      key: `facial:${u.id}`,
      kind: 'facial',
      label: 'Selfie (comparar com o documento)',
      detail: '',
      images: imagesOf([[u.facial.selfieUrl, 'Selfie']]),
      approveUrl: `/verification/admin/facial/${u.id}/approve`,
      rejectUrl: `/verification/admin/facial/${u.id}/reject`,
      permission: P.stores,
      targetId: u.id,
      submittedAt: isoOrNull(u.facial.submittedAt),
    });
  }
  if (kind === 'motoboy' && u.courier) {
    items.push({
      key: `courier:${u.id}`,
      kind: 'courier',
      label: 'CNH e placa',
      detail: `CNH: ${u.courier.cnhNumber || '-'} · Placa: ${u.courier.plate || '-'}`,
      images: imagesOf([[u.courier.cnhPhotoUrl, 'Foto da CNH'], [u.courier.platePhotoUrl, 'Foto da placa']]),
      approveUrl: `/verification/admin/motoboy/${u.id}/approve`,
      rejectUrl: `/verification/admin/motoboy/${u.id}/reject`,
      permission: P.motoboys,
      targetId: u.id,
      submittedAt: isoOrNull(u.courier.submittedAt),
    });
  }
  if (kind === 'lojista') {
    for (const s of u.stores) {
      const sid = String(s._id);
      if (s.verification?.cnpj?.status === 'pending') {
        const c = s.verification.cnpj;
        items.push({
          key: `cnpj:${sid}`,
          kind: 'cnpj',
          label: `CNPJ · ${s.name}`,
          detail: `${c.number} · ${c.razaoSocial || '?'} · ${c.situacao || '?'}`,
          images: [],
          approveUrl: `/verification/admin/store/${sid}/cnpj/approve`,
          rejectUrl: `/verification/admin/store/${sid}/cnpj/reject`,
          permission: P.stores,
          targetId: sid,
          submittedAt: isoOrNull(c.submittedAt),
        });
      }
      if (s.verification?.address?.status === 'pending') {
        items.push({
          key: `address:${sid}`,
          kind: 'address',
          label: `Endereço · ${s.name}`,
          detail: formatStoreAddress(s) || 'Endereço não informado',
          images: imagesOf([[s.verification.address.comprovanteUrl, 'Comprovante de endereço']]),
          approveUrl: `/verification/admin/store/${sid}/address/approve`,
          rejectUrl: `/verification/admin/store/${sid}/address/reject`,
          permission: P.stores,
          targetId: sid,
          submittedAt: isoOrNull(s.verification.address.submittedAt),
        });
      }
    }
  }
  return items;
}

/** Junta as filas por pessoa (mesma regra da página antiga). Pessoa sem item pendente não entra. */
export function buildVerificationPeople({ docs, stores, facialOwners, motoboys }: VerificationLists): VerificationPerson[] {
  const byId = new Map<string, Agg>();
  const ensure = (id: string, base?: Raw | null): Agg => {
    if (!byId.has(id)) byId.set(id, { id, name: '', roles: [], stores: [] });
    const u = byId.get(id)!;
    if (base) {
      if (base.name) u.name = base.name;
      if (base.email) u.email = base.email;
      const r: string[] = base.roles || (base.role ? [base.role] : []);
      if (r.length) u.roles = Array.from(new Set([...u.roles, ...r]));
    }
    return u;
  };

  for (const d of docs) {
    const u = ensure(String(d._id), d);
    u.doc = d.verification?.document || null;
  }
  for (const f of facialOwners) {
    const u = ensure(String(f._id), f);
    u.facial = f.verification?.facial || u.facial;
  }
  for (const m of motoboys) {
    const u = ensure(String(m._id), m);
    u.courier = m.verification?.courier || null;
    if (!u.facial && m.verification?.facial?.status === 'pending') u.facial = m.verification.facial;
    if (!u.roles.includes('motoboy')) u.roles.push('motoboy');
  }
  for (const s of stores) {
    const owner = s.ownerId && typeof s.ownerId === 'object' ? s.ownerId : null;
    const oid = owner?._id ? String(owner._id) : typeof s.ownerId === 'string' ? s.ownerId : '';
    if (!oid) continue;
    const u = ensure(oid, owner);
    u.stores.push(s);
    if (!u.roles.includes('lojista')) u.roles.push('lojista');
  }

  const all = Array.from(byId.values());
  const isLojista = (u: Agg) => u.roles.includes('lojista') || u.stores.length > 0;
  const isMotoboy = (u: Agg) => !isLojista(u) && (u.roles.includes('motoboy') || !!u.courier);
  const kindOf = (u: Agg): PersonKind => (isLojista(u) ? 'lojista' : isMotoboy(u) ? 'motoboy' : 'cliente');
  const ordered = [
    ...all.filter(isLojista),
    ...all.filter(isMotoboy),
    ...all.filter((u) => !isLojista(u) && !isMotoboy(u)),
  ];

  return ordered
    .map((u) => {
      const kind = kindOf(u);
      return {
        id: u.id,
        name: u.name || 'Usuário',
        email: u.email,
        kind,
        storeNames: u.stores.map((s) => s.name).filter(Boolean),
        items: itemsOf(u, kind),
      };
    })
    .filter((p) => p.items.length > 0);
}

/**
 * Recusa por item (spec 5.1): o servidor guarda um texto só; motivo e mensagem viram "Motivo. Mensagem".
 * Sem ponto final: o aviso do servidor já acrescenta ". Corrija e envie de novo." (pré-voo F19).
 * A Task 3.2 apaga esta função (a recusa passa a mandar {reasonCode, message?, resend}).
 */
export function composeRejectReason(motivo: string, mensagem = ''): string {
  const m = motivo.trim().replace(/[.\s]+$/, '');
  const msg = mensagem.trim().replace(/[.\s]+$/, '');
  return msg ? `${m}. ${msg}` : m;
}

const NOT_PENDING = /não (está|estão) pendentes?/i;

/**
 * "Já feito" destas rotas: aprovar/recusar item que não está mais pendente. D3b-3 (spec 4.4): o servidor
 * responde 409 VERIFICATION_NOT_PENDING; o 400 antigo ("Documento não está pendente", "Dados não estão
 * pendentes"…) continua aceito por compatibilidade. Outro erro nunca vira feito.
 */
export function isVerificationAlreadyDecided(err: unknown): boolean {
  if (isConflictWithCode(err, 'VERIFICATION_NOT_PENDING')) return true;
  if (!isHttpStatus(err, 400)) return false;
  const data = (err as { response?: { data?: { error?: unknown } } }).response?.data;
  return typeof data?.error === 'string' && NOT_PENDING.test(data.error);
}

/* ---------- D3b-2b: recusa padronizada ---------- */

export type VerificationRejectReason =
  | 'illegible' | 'face_mismatch' | 'expired' | 'data_mismatch' | 'cnpj_invalid' | 'address_unproven' | 'other';

/** Os 7 motivos, na ordem e com os rótulos de src/services/verification/rejectReasons.ts (plano mestre). */
export const REJECT_REASONS: { value: VerificationRejectReason; label: string }[] = [
  { value: 'illegible', label: 'Foto ilegível' },
  { value: 'face_mismatch', label: 'Selfie não confere com o documento' },
  { value: 'expired', label: 'Documento vencido' },
  { value: 'data_mismatch', label: 'Dados não conferem' },
  { value: 'cnpj_invalid', label: 'CNPJ inválido ou inativo' },
  { value: 'address_unproven', label: 'Comprovante de endereço não aceito' },
  { value: 'other', label: 'Outro motivo' },
];

export const REJECT_REASON_LABEL = Object.fromEntries(REJECT_REASONS.map((r) => [r.value, r.label])) as Record<
  VerificationRejectReason,
  string
>;

/** Limite da mensagem livre (o servidor recusa acima disso). */
export const REJECT_MESSAGE_MAX = 300;

/** Rótulo curto de cada tipo de item: aviso do 409 e linha do tempo da ficha. */
export const VERIFICATION_KIND_SHORT: Record<VerificationKind, string> = {
  document: 'Documento',
  facial: 'Selfie',
  courier: 'CNH e placa',
  cnpj: 'CNPJ',
  address: 'Endereço',
};

export interface RejectBody { reasonCode: VerificationRejectReason; resend: boolean; message?: string }

/** Corpo das rotas de recusa: a mensagem vai aparada e só quando há texto; `resend` sempre vai. */
export function buildRejectBody(reasonCode: VerificationRejectReason, message: string, resend: boolean): RejectBody {
  const m = message.trim();
  return m ? { reasonCode, message: m, resend } : { reasonCode, resend };
}

/** A folha pode enviar: cada item marcado tem motivo; "Outro motivo" exige a mensagem; mensagem até 300. */
export function rejectReady(codes: (VerificationRejectReason | '')[], message: string): boolean {
  const m = message.trim();
  if (codes.length === 0 || codes.some((c) => c === '')) return false;
  if (m.length > REJECT_MESSAGE_MAX) return false;
  return !codes.includes('other') || m !== '';
}

/* ---------- D3b-2b: espera ---------- */

/** "há 3 h", "há 2 d", "agora"; null quando o servidor não mandou a data (o item não mostra nada). */
export function waitingText(submittedAt: string | null | undefined, now: number = Date.now()): string | null {
  if (!submittedAt || !Number.isFinite(Date.parse(submittedAt))) return null;
  return ageLabel(submittedAt, now);
}

/** Envio mais antigo da pessoa (a linha da lista mostra quanto ela espera). */
export function oldestSubmittedAt(p: Pick<VerificationPerson, 'items'>): string | null {
  let best: string | null = null;
  for (const i of p.items) {
    if (i.submittedAt && (best === null || Date.parse(i.submittedAt) < Date.parse(best))) best = i.submittedAt;
  }
  return best;
}

export interface VerificationStats { avgHoursToDecision: number | null; decisions30d: number }

export function isVerificationStats(d: unknown): d is VerificationStats {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  const o = d as Record<string, unknown>;
  const avg = o.avgHoursToDecision;
  const n = o.decisions30d;
  const avgOk = avg === null || (typeof avg === 'number' && Number.isFinite(avg) && avg >= 0);
  return avgOk && typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

const decimal1 = (n: number): string => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** Linha do topo da fila: horas até 48 h, depois dias. */
export function avgWaitText(s: VerificationStats): string {
  if (s.avgHoursToDecision === null) return 'Espera média: nenhuma decisão com data de envio nos últimos 30 dias';
  const h = s.avgHoursToDecision;
  const value = h >= 48 ? `${decimal1(h / 24)} d` : `${decimal1(h)} h`;
  const n = s.decisions30d === 1 ? '1 decisão' : `${s.decisions30d} decisões`;
  return `Espera média até a decisão: ${value} · ${n} em 30 dias`;
}

/* ---------- D3b-2b: "Aprovar tudo" ---------- */

export type ApproveAllSubject = 'client' | 'store' | 'motoboy';

/** Uma chamada à rota única: `items` é a lista que o admin viu (o servidor confere e responde 409 se mudou). */
export interface ApproveAllCall { url: string; items: VerificationKind[]; keys: string[]; permission: string }

const SUBJECT_PERMISSION: Record<ApproveAllSubject, string> = {
  client: VERIFICATION_PERMISSIONS.clients,
  store: VERIFICATION_PERMISSIONS.stores,
  motoboy: VERIFICATION_PERMISSIONS.motoboys,
};
const isStoreKind = (k: VerificationKind): boolean => k === 'cnpj' || k === 'address';

function approveCall(subject: ApproveAllSubject, id: string, items: VerificationItem[]): ApproveAllCall {
  return {
    url: `/verification/admin/subject/${subject}/${encodeURIComponent(id)}/approve-all`,
    items: items.map((i) => i.kind),
    keys: items.map((i) => i.key),
    permission: SUBJECT_PERMISSION[subject],
  };
}

/**
 * Chamadas do "Aprovar tudo" de uma pessoa (nota 3 da P3): cliente e motoboy pelo userId; lojista por loja, com o
 * documento e a selfie do dono na primeira; lojista sem item de loja na fila, pelo userId como cliente.
 */
export function approveAllUrl(person: Pick<VerificationPerson, 'id' | 'kind' | 'items'>): ApproveAllCall[] {
  if (person.items.length === 0) return [];
  if (person.kind === 'cliente') return [approveCall('client', person.id, person.items)];
  if (person.kind === 'motoboy') return [approveCall('motoboy', person.id, person.items)];
  const owner = person.items.filter((i) => !isStoreKind(i.kind));
  const storeIds = Array.from(new Set(person.items.filter((i) => isStoreKind(i.kind)).map((i) => i.targetId)));
  if (storeIds.length === 0) return [approveCall('client', person.id, owner)];
  return storeIds.map((sid, n) => approveCall('store', sid, [
    ...(n === 0 ? owner : []),
    ...person.items.filter((i) => isStoreKind(i.kind) && i.targetId === sid),
  ]));
}

export const isVerificationChanged = (err: unknown): boolean => isConflictWithCode(err, 'VERIFICATION_CHANGED');

const isKind = (k: unknown): k is VerificationKind =>
  typeof k === 'string' && Object.prototype.hasOwnProperty.call(VERIFICATION_KIND_SHORT, k);

/** Aviso do 409 VERIFICATION_CHANGED, com o que está pendente agora (`currentPending`, quando o servidor manda). */
export function verificationChangedText(err: unknown): string {
  const raw = (err as { response?: { data?: { currentPending?: unknown } } } | null)?.response?.data?.currentPending;
  const kinds = Array.isArray(raw) ? raw.filter(isKind) : [];
  const base = 'A verificação mudou enquanto você olhava, e estes itens não foram aprovados.';
  return kinds.length > 0
    ? `${base} Pendentes agora: ${kinds.map((k) => VERIFICATION_KIND_SHORT[k]).join(', ')}. Confira antes de aprovar.`
    : `${base} A lista foi atualizada.`;
}
