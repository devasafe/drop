/**
 * Validação de formato de documentos brasileiros (sem consulta externa).
 * CPF: dígitos verificadores reais. RG: validação leve (formato varia por estado).
 */

export function onlyDigits(value: string): string {
  return (value || '').replace(/\D/g, '');
}

export function isValidCPF(cpf: string): boolean {
  const c = onlyDigits(cpf);
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
  if (check !== parseInt(c[10], 10)) return false;

  return true;
}

// RG não tem algoritmo nacional padrão — validação leve de tamanho/charset.
export function isValidRG(rg: string): boolean {
  const r = onlyDigits(rg);
  return r.length >= 5 && r.length <= 14;
}

export function isValidCNPJ(cnpj: string): boolean {
  const c = onlyDigits(cnpj);
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false; // rejeita todos iguais

  const calcDigit = (len: number): number => {
    let sum = 0;
    let pos = len - 7;
    for (let i = len; i >= 1; i--) {
      sum += parseInt(c[len - i], 10) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };

  if (calcDigit(12) !== parseInt(c[12], 10)) return false;
  if (calcDigit(13) !== parseInt(c[13], 10)) return false;
  return true;
}

// Normaliza telefone brasileiro para E.164 (+55...). Aceita com/sem DDI.
export function toE164BR(phone: string): string | null {
  let d = onlyDigits(phone);
  if (d.length === 10 || d.length === 11) d = '55' + d; // sem DDI -> assume BR
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    return '+' + d;
  }
  return null;
}
