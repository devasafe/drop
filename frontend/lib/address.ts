/**
 * Quebra um endereço "cheio" do backend em duas linhas para os resumos:
 *   line1 = logradouro + número (ex.: "Rua França, 213")
 *   line2 = bairro + cidade   (ex.: "Jardim Caiçara, Cabo Frio")
 * Descarta CEP e UF (não ocupam espaço no card). Aceita separadores por vírgula
 * e por " - " (os dois formatos que o backend produz).
 */
export function splitAddressLines(full?: string | null): { line1: string; line2: string } {
  if (!full || !full.trim()) return { line1: '', line2: '' };

  const isCep = (s: string) => /^\d{5}-?\d{3}$/.test(s.replace(/\s/g, ''));
  const isUf = (s: string) => /^[A-Za-zÀ-ÿ]{2}$/.test(s) && s === s.toUpperCase();

  const parts = full
    .replace(/\s*-\s*/g, ', ')      // "Rua X, 213 - Bairro" → "Rua X, 213, Bairro"
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !isCep(s) && !isUf(s));

  if (parts.length === 0) return { line1: full.trim(), line2: '' };

  // Se a 2ª parte é o número (ex.: "213", "213A"), junta com o logradouro.
  let idx = 1;
  let line1 = parts[0];
  if (parts[1] && /^\d+[A-Za-z]?$/.test(parts[1])) {
    line1 = `${parts[0]}, ${parts[1]}`;
    idx = 2;
  }
  const line2 = parts.slice(idx, idx + 2).join(', ');
  return { line1, line2 };
}
