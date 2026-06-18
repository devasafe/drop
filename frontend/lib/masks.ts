// Máscaras de exibição (formatação) para inputs brasileiros.
// IMPORTANTE: enviar sempre os valores LIMPOS ao backend (onlyDigits), pois a
// validação espera dígitos puros (ex.: CPF /^\d{11}$/).

export function onlyDigits(v: string): string {
  return (v || '').replace(/\D/g, '');
}

// CPF: 000.000.000-00
export function maskCPF(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length > 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length > 6) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  if (d.length > 3) return `${d.slice(0, 3)}.${d.slice(3)}`;
  return d;
}

// Telefone: (11) 99999-9999 (celular) ou (11) 9999-9999 (fixo)
export function maskPhone(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// RG: 00.000.000-0 (dígito verificador pode ser X). Formato comum (SP).
export function maskRG(v: string): string {
  const d = (v || '').toUpperCase().replace(/[^0-9X]/g, '').slice(0, 9);
  if (d.length > 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}-${d.slice(8)}`;
  if (d.length > 5) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length > 2) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return d;
}

// Limpa o RG mantendo dígitos e o X verificador (para envio).
export function cleanRG(v: string): string {
  return (v || '').toUpperCase().replace(/[^0-9X]/g, '');
}

// CNPJ: 00.000.000/0000-00
export function maskCNPJ(v: string): string {
  const d = onlyDigits(v).slice(0, 14);
  if (d.length > 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length > 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  if (d.length > 5) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length > 2) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return d;
}

// CNH: 11 dígitos (somente números)
export function maskCNH(v: string): string {
  return onlyDigits(v).slice(0, 11);
}

// Placa: ABC1D23 (Mercosul) ou ABC1234 (antiga) — maiúsculas, sem símbolos, até 7 chars
export function maskPlate(v: string): string {
  return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

// CEP: 00000-000
export function maskCEP(v: string): string {
  const d = onlyDigits(v).slice(0, 8);
  if (d.length > 5) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return d;
}
