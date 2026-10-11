/** Mostra só a 1ª letra do usuário: confirma o destino sem expor o e-mail inteiro. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return email;
  return `${email[0]}***${email.slice(at)}`;
}
