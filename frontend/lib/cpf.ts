// Validação de CPF (dígitos verificadores) — mesma regra do backend
// (src/utils/documentValidation.ts → isValidCPF). Aceita com ou sem máscara.

export function isValidCPF(cpf: string): boolean {
  const c = (cpf || '').replace(/\D/g, '');
  if (c.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(c)) return false; // rejeita todos iguais (000..., 111...)

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(c[i], 10) * (10 - i);
  let check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  if (check !== parseInt(c[9], 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(c[i], 10) * (11 - i);
  check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  return check === parseInt(c[10], 10);
}
