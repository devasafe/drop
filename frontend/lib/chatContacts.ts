export interface ChatContact {
  id: string;
  name: string;
  role: 'lojista' | 'cliente' | 'motoboy';
  kind: 'store' | 'user';
  context?: string;
}

/** Tipo de participante p/ o openChatWithStore, a partir do contato:
 * loja (kind store) → 'store'; motoboy → 'motoboy'; senão → 'customer'. */
export function participantTypeFor(c: Pick<ChatContact, 'role' | 'kind'>): 'store' | 'customer' | 'motoboy' {
  if (c.kind === 'store') return 'store';
  if (c.role === 'motoboy') return 'motoboy';
  return 'customer';
}
