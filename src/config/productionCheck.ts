/**
 * Operação real: o que falta na configuração para operar com dinheiro de verdade. O boot em
 * produção só AVISA (logger.error, visível nos Runtime Logs do Coolify) — o servidor ainda roda
 * com o Asaas de sandbox e não pode cair por isso. Lista pura, testável sem process.env.
 */
export interface ConfigWarning { key: string; message: string }

type EnvLike = Record<string, string | undefined>;

const has = (v: string | undefined) => !!v && v.trim().length > 0;

export function productionConfigWarnings(e: EnvLike): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  const warn = (key: string, message: string) => out.push({ key, message });

  const asaasUrl = e.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3';
  if (asaasUrl.includes('sandbox')) {
    warn('ASAAS_API_URL', 'Asaas em sandbox: nenhuma cobrança movimenta dinheiro real (produção: https://api.asaas.com/v3).');
  } else if (!has(e.ASAAS_API_KEY) || !e.ASAAS_API_KEY!.trim().startsWith('$aact_prod_')) {
    warn('ASAAS_API_KEY', 'ASAAS_API_KEY ausente ou de sandbox com a URL de produção: a mensalidade da DROP não é cobrada.');
  }
  if (!has(e.ASAAS_WEBHOOK_TOKEN)) {
    warn('ASAAS_WEBHOOK_TOKEN', 'ASAAS_WEBHOOK_TOKEN ausente: o webhook da conta da DROP recusa todas as chamadas.');
  }
  if (!/^[0-9a-fA-F]{64}$/.test((e.ENCRYPTION_KEY || '').trim())) {
    warn('ENCRYPTION_KEY', 'ENCRYPTION_KEY ausente ou fora do formato (64 caracteres hex): as chaves Asaas das lojas não são cifradas.');
  }
  if (e.KYC_ENFORCED !== 'true') {
    warn('KYC_ENFORCED', 'KYC_ENFORCED desligado: loja não verificada aparece na vitrine e motoboy não verificado recebe corrida.');
  }
  if (!has(e.CORS_ORIGIN) || /localhost|127\.0\.0\.1/.test(e.CORS_ORIGIN!)) {
    warn('CORS_ORIGIN', 'CORS_ORIGIN vazio ou com localhost: configure o domínio exato do site.');
  }
  if (!has(e.COOKIE_DOMAIN)) {
    warn('COOKIE_DOMAIN', 'COOKIE_DOMAIN ausente: o login fica preso ao domínio da API (produção: .dropapp.com.br).');
  }
  if (!(e.PUBLIC_API_URL || '').startsWith('https://')) {
    warn('PUBLIC_API_URL', 'PUBLIC_API_URL sem https: os webhooks registrados nas contas das lojas não funcionam.');
  }
  if (!has(e.DROP_EGRESS_IP)) {
    warn('DROP_EGRESS_IP', 'DROP_EGRESS_IP vazio: o lojista não sabe qual IP liberar no painel do Asaas.');
  }
  if (e.ALLOW_VERCEL_PREVIEWS === 'true') {
    warn('ALLOW_VERCEL_PREVIEWS', 'ALLOW_VERCEL_PREVIEWS ligado: o CORS aceita qualquer pré-visualização da Vercel.');
  }
  return out;
}
