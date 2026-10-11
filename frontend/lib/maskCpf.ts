/** CPF com o miolo escondido, como no recibo e na barra da Sacola. */
export function maskCpfMiddle(cpf: string): string {
  const d = (cpf || '').replace(/\D/g, '');
  if (d.length !== 11) return '';
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}
