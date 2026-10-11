const KEY = 'drop:justPaid';
const read = (): string | null => { try { return sessionStorage.getItem(KEY); } catch { return null; } };

/** Marca o pedido que acabou de ser pago nesta aba (a tela "Pedido confirmado" aparece uma vez). */
export function markJustPaid(orderId: string): void { try { sessionStorage.setItem(KEY, String(orderId)); } catch { /* sem storage: nunca mostra */ } }
export function peekJustPaid(orderId: string): boolean { return read() === String(orderId); }
export function consumeJustPaid(orderId: string): boolean {
  if (!peekJustPaid(orderId)) return false;
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  return true;
}
