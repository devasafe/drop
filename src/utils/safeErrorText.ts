/**
 * Máscara de texto vindo do Asaas (descrição de erro) antes de ir para log/lastError:
 * e-mails, UUIDs (chave Pix aleatória/EVP) e dígitos (CPF/CNPJ/telefone) viram `***`/`*`.
 * A descrição do Asaas pode ecoar a chave Pix ou o documento do recebedor.
 */
export function maskSensitiveText(text: unknown): string {
  return String(text ?? '')
    .replace(/[^\s@]+@[^\s@]+/g, '***')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '***')
    .replace(/\d/g, '*');
}

/** Lista `errors[]` do Asaas só com `code` e a descrição mascarada. */
export function maskAsaasErrors(errors: unknown): Array<{ code: string; description: string }> {
  if (!Array.isArray(errors)) return [];
  return errors.map((e: any) => ({ code: String(e?.code ?? ''), description: maskSensitiveText(e?.description) }));
}

/**
 * lastError seguro: o `code` do Asaas e a descrição mascarada. Erros que não são do Asaas
 * (ex.: StorePaymentsNotReadyError) têm mensagem nossa e passam como estão.
 */
export function safeErrorText(err: unknown): string {
  const anyErr = err as any;
  if (anyErr && Array.isArray(anyErr.errors) && typeof anyErr.status === 'number') {
    const e = anyErr.errors[0];
    const code = e?.code || `HTTP_${anyErr.status}`;
    const desc = maskSensitiveText(e?.description);
    return desc ? `${code}: ${desc}` : code;
  }
  return (err as Error)?.message || 'erro';
}
