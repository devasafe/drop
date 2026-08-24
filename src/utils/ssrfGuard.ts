import dns from 'dns';
import net from 'net';

/**
 * Guarda anti-SSRF pra URLs de webhook do lojista. O servidor faz requisições
 * pra essas URLs, então um alvo malicioso (metadata da cloud, localhost, redes
 * internas) precisa ser bloqueado. Checa protocolo (https), hostnames proibidos
 * e RESOLVE o DNS conferindo os IPs (anti DNS-rebinding). Rechecar a cada entrega.
 */

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // malformado → inseguro
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;      // "this", private, loopback
  if (a === 169 && b === 254) return true;                // link-local + metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true;       // private
  if (a === 192 && b === 168) return true;                // private
  if (a === 100 && b >= 64 && b <= 127) return true;      // CGNAT (100.64/10)
  if (a >= 224) return true;                              // multicast/reservado
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === '::1' || s === '::') return true;             // loopback / unspecified
  if (s.startsWith('fe80') || s.startsWith('fc') || s.startsWith('fd')) return true; // link-local + ULA
  const m = s.match(/(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);  // IPv4-mapped ::ffff:a.b.c.d
  if (m) return isPrivateIPv4(m[1]);
  return false;
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // não reconhecido → trate como inseguro
}

const BLOCKED_HOST = /(^localhost$)|(\.local$)|(^metadata$)|(metadata\.google\.internal$)/i;

export interface UrlCheck { ok: boolean; reason?: string }

/** Valida uma URL de webhook (https + host público, com resolução DNS). */
export async function checkWebhookUrl(raw: string): Promise<UrlCheck> {
  let u: URL;
  try { u = new URL(String(raw)); } catch { return { ok: false, reason: 'URL inválida' }; }
  if (u.protocol !== 'https:') return { ok: false, reason: 'Use uma URL https://' };
  const host = u.hostname.replace(/^\[|\]$/g, ''); // remove colchetes de IPv6
  if (BLOCKED_HOST.test(host)) return { ok: false, reason: 'Host não permitido' };

  if (net.isIP(host)) {
    return isPrivateIp(host) ? { ok: false, reason: 'IP privado/reservado não permitido' } : { ok: true };
  }

  let addrs: dns.LookupAddress[];
  try { addrs = await dns.promises.lookup(host, { all: true }); }
  catch { return { ok: false, reason: 'Não foi possível resolver o host' }; }
  if (addrs.length === 0) return { ok: false, reason: 'Host sem endereço' };
  for (const a of addrs) {
    if (isPrivateIp(a.address)) return { ok: false, reason: 'Host resolve para IP privado/reservado' };
  }
  return { ok: true };
}
