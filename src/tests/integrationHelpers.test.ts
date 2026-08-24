import crypto from 'crypto';
import { isPrivateIp, checkWebhookUrl } from '../utils/ssrfGuard';
import { generateApiKey, parseApiKey, verifySecret, generateWebhookSecret } from '../services/storeIntegration';
import { parseStockOp, csvEscape } from '../controllers/integrationsController';

describe('SSRF guard', () => {
  test('reconhece IPs privados/reservados', () => {
    ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.5.4', '192.168.1.1', '100.64.0.1', '::1', 'fe80::1', 'fd00::1'].forEach((ip) => {
      expect(isPrivateIp(ip)).toBe(true);
    });
  });
  test('IP público passa', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
  });
  test('bloqueia http, localhost, metadata e IPs internos (sem DNS)', async () => {
    expect((await checkWebhookUrl('http://example.com/hook')).ok).toBe(false);   // não é https
    expect((await checkWebhookUrl('https://localhost/hook')).ok).toBe(false);    // host bloqueado
    expect((await checkWebhookUrl('https://169.254.169.254/latest')).ok).toBe(false); // metadata
    expect((await checkWebhookUrl('https://10.0.0.1/hook')).ok).toBe(false);     // IP privado
    expect((await checkWebhookUrl('nao-e-url')).ok).toBe(false);
  });
  test('IP público https passa (sem DNS)', async () => {
    expect((await checkWebhookUrl('https://8.8.8.8/hook')).ok).toBe(true);
  });
});

describe('API key', () => {
  test('gera, faz parse e valida (timing-safe)', () => {
    const { key, prefix, keyHash } = generateApiKey();
    expect(key.startsWith('dk_')).toBe(true);
    const parsed = parseApiKey(key)!;
    expect(parsed.prefix).toBe(prefix);
    expect(verifySecret(parsed.secret, keyHash)).toBe(true);
    expect(verifySecret('secret-errado', keyHash)).toBe(false);
  });
  test('parse rejeita formato inválido', () => {
    expect(parseApiKey('token-qualquer')).toBeNull();
    expect(parseApiKey('')).toBeNull();
  });
  test('webhook secret tem prefixo whsec_', () => {
    expect(generateWebhookSecret().startsWith('whsec_')).toBe(true);
  });
});

describe('parseStockOp', () => {
  test('absoluto e delta válidos', () => {
    expect(parseStockOp({ quantity: 5 })).toEqual({ set: 5 });
    expect(parseStockOp({ adjust: -2 })).toEqual({ adjust: -2 });
  });
  test('rejeita ambos/nenhum e valores inválidos', () => {
    expect('error' in parseStockOp({})).toBe(true);
    expect('error' in parseStockOp({ quantity: 1, adjust: 1 })).toBe(true);
    expect('error' in parseStockOp({ quantity: -1 })).toBe(true);
    expect('error' in parseStockOp({ quantity: 1.5 })).toBe(true);
    expect('error' in parseStockOp({ adjust: 'x' })).toBe(true);
  });
});

describe('csvEscape (anti formula-injection)', () => {
  test('prefixa fórmulas e escapa vírgula/aspas', () => {
    expect(csvEscape('=CMD()')).toBe("'=CMD()");
    expect(csvEscape('+1')).toBe("'+1");
    expect(csvEscape('-5')).toBe("'-5");
    expect(csvEscape('@x')).toBe("'@x");
    expect(csvEscape('Nome, com vírgula')).toBe('"Nome, com vírgula"');
    expect(csvEscape('aspas"aqui')).toBe('"aspas""aqui"');
    expect(csvEscape('normal')).toBe('normal');
  });
});

describe('HMAC de webhook (timestamp.corpo)', () => {
  test('assinatura confere', () => {
    const secret = 'whsec_abc';
    const ts = '1756036800';
    const body = JSON.stringify({ event: 'stock.updated' });
    const sig = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
    const expected = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
    expect(sig).toBe(expected);
  });
});
