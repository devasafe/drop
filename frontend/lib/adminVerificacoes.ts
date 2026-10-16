/**
 * Fila de verificações do admin (D3a · P3.2, telas 2 e 9): junta as três filas do servidor por pessoa,
 * com a MESMA regra da página antiga (pages/admin/verificacoes.tsx em 91a9597), e descreve cada item
 * pendente com as rotas de aprovar/recusar e a permissão que a rota exige.
 */
import { isHttpStatus } from './adminErrors';

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
 */
export function composeRejectReason(motivo: string, mensagem = ''): string {
  const m = motivo.trim().replace(/[.\s]+$/, '');
  const msg = mensagem.trim().replace(/[.\s]+$/, '');
  return msg ? `${m}. ${msg}` : m;
}

const NOT_PENDING = /não (está|estão) pendentes?/i;

/**
 * "Já feito" destas rotas: aprovar/recusar item que não está mais pendente responde 400
 * ("Documento não está pendente", "Dados não estão pendentes"…). Outro erro nunca vira feito.
 */
export function isVerificationAlreadyDecided(err: unknown): boolean {
  if (!isHttpStatus(err, 400)) return false;
  const data = (err as { response?: { data?: { error?: unknown } } }).response?.data;
  return typeof data?.error === 'string' && NOT_PENDING.test(data.error);
}
