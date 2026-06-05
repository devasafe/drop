/**
 * Utilitários relacionados a dados de usuário.
 * Centraliza lógica que antes estava duplicada em 4+ controllers.
 */

export interface IAddress {
  _id?: any;
  label?: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  latitude?: string;
  longitude?: string;
  isDefault?: boolean;
}

/**
 * Retorna o endereço padrão do usuário.
 * Prefere o marcado como isDefault; caso nenhum, retorna o primeiro.
 */
export function getDefaultAddress(user: { addresses?: IAddress[] }): IAddress | null {
  if (!user.addresses || user.addresses.length === 0) return null;
  return user.addresses.find(addr => addr.isDefault === true) ?? user.addresses[0] ?? null;
}
