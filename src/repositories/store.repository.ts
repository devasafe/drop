/**
 * Serializers de Store. NUNCA devolver o registro do Prisma direto: ele carrega
 * `asaas` (apiKey cifrada da subconta, walletId, chave PIX), `verification`
 * (comprovante de endereço), `cnpj`, `apiConfig` e dados de comissão.
 */

// O que a vitrine precisa — allowlist (campo novo no model NÃO vaza por padrão).
const PUBLIC_STORE_FIELDS = [
  'id', 'ownerId', 'name', 'address', 'street', 'number', 'neighborhood', 'city', 'state',
  'latitude', 'longitude', 'plan', 'isOpen', 'isVerified', 'operatingHours',
  'featuredBannerUrl', 'coverBannerUrl', 'createdAt',
] as const;

export function toPublicStore(store: any): any {
  if (!store) return store;
  const out: Record<string, any> = {};
  for (const k of PUBLIC_STORE_FIELDS) {
    if (store[k] !== undefined) out[k] = store[k];
  }
  out.id = out.id ?? store._id;
  out._id = out.id; // o frontend ainda lê `_id`
  return out;
}

/**
 * Visão do DONO da loja: tudo, menos segredos da subconta Asaas. Mantém só o que o
 * painel precisa saber (status e se há chave PIX) — chave de API, walletId e accountId
 * ficam no servidor.
 */
export function toOwnerStore(store: any): any {
  if (!store) return store;
  const { asaas, ...rest } = store;
  const a = (asaas || null) as any;
  return {
    ...rest,
    _id: store._id ?? store.id,
    asaas: a ? { status: a.status ?? null, hasPixKey: !!a.pixKey, pixKeyType: a.pixKeyType ?? null } : null,
  };
}
