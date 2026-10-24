/**
 * Operação real · lista do que falta na configuração de produção. O boot em produção só AVISA
 * (logger.error, aparece no Coolify): o servidor ainda roda no sandbox e não pode cair por isso.
 */
import { productionConfigWarnings } from '../config/productionCheck';

const READY = {
  ASAAS_API_URL: 'https://api.asaas.com/v3',
  ASAAS_API_KEY: '$aact_prod_xyz',
  ASAAS_WEBHOOK_TOKEN: 'w'.repeat(32),
  ENCRYPTION_KEY: 'a'.repeat(64),
  KYC_ENFORCED: 'true',
  CORS_ORIGIN: 'https://dropapp.com.br,https://www.dropapp.com.br',
  COOKIE_DOMAIN: '.dropapp.com.br',
  PUBLIC_API_URL: 'https://api.dropapp.com.br',
  DROP_EGRESS_IP: '203.0.113.10',
};

const keysOf = (env: Record<string, string | undefined>) => productionConfigWarnings(env).map((w) => w.key);

describe('productionConfigWarnings', () => {
  it('configuração pronta: nada a avisar', () => {
    expect(productionConfigWarnings(READY)).toEqual([]);
  });

  it('Asaas no sandbox (ou sem URL, que cai no sandbox)', () => {
    expect(keysOf({ ...READY, ASAAS_API_URL: 'https://sandbox.asaas.com/api/v3' })).toEqual(['ASAAS_API_URL']);
    expect(keysOf({ ...READY, ASAAS_API_URL: undefined })).toEqual(['ASAAS_API_URL']);
  });

  it('chave de API de sandbox com a URL de produção', () => {
    expect(keysOf({ ...READY, ASAAS_API_KEY: '$aact_hmlg_xyz' })).toEqual(['ASAAS_API_KEY']);
    expect(keysOf({ ...READY, ASAAS_API_KEY: '' })).toEqual(['ASAAS_API_KEY']);
  });

  it('segredos ausentes ou fora do formato', () => {
    expect(keysOf({ ...READY, ASAAS_WEBHOOK_TOKEN: undefined })).toEqual(['ASAAS_WEBHOOK_TOKEN']);
    expect(keysOf({ ...READY, ENCRYPTION_KEY: undefined })).toEqual(['ENCRYPTION_KEY']);
    expect(keysOf({ ...READY, ENCRYPTION_KEY: 'curta' })).toEqual(['ENCRYPTION_KEY']);
    expect(keysOf({ ...READY, ENCRYPTION_KEY: ` ${'b'.repeat(64)}\n` })).toEqual([]);
  });

  it('verificação desligada, CORS de localhost, cookie sem domínio, URL pública sem https, IP vazio', () => {
    expect(keysOf({ ...READY, KYC_ENFORCED: 'false' })).toEqual(['KYC_ENFORCED']);
    expect(keysOf({ ...READY, CORS_ORIGIN: 'http://localhost:3000' })).toEqual(['CORS_ORIGIN']);
    expect(keysOf({ ...READY, COOKIE_DOMAIN: undefined })).toEqual(['COOKIE_DOMAIN']);
    expect(keysOf({ ...READY, PUBLIC_API_URL: 'http://api.dropapp.com.br' })).toEqual(['PUBLIC_API_URL']);
    expect(keysOf({ ...READY, DROP_EGRESS_IP: '' })).toEqual(['DROP_EGRESS_IP']);
  });

  it('pré-visualizações da Vercel liberadas no CORS', () => {
    expect(keysOf({ ...READY, ALLOW_VERCEL_PREVIEWS: 'true' })).toEqual(['ALLOW_VERCEL_PREVIEWS']);
  });

  it('cada aviso traz uma mensagem em português', () => {
    const all = productionConfigWarnings({});
    expect(all.length).toBeGreaterThan(5);
    for (const w of all) expect(w.message.length).toBeGreaterThan(10);
  });
});
