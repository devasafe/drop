export interface RedirectRule {
  source: string;
  destination: string;
  permanent: boolean;
  has?: Array<{ type: 'query'; key: string; value?: string }>;
}

/** Aplica a lista como o Next: 1ª regra que casa, :param, has de query e query repassada. */
export function resolveRedirect(rules: RedirectRule[], url: string): { location: string; permanent: boolean } | null {
  const u = new URL(url, 'http://x');
  for (const r of rules) {
    const names: string[] = [];
    const src = r.source
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:(\w+)/g, (_m, n: string) => { names.push(n); return '([^/]+)'; });
    const m = new RegExp(`^${src}/?$`).exec(u.pathname);
    if (!m) continue;
    const hasOk = (r.has || []).every((h) => h.type === 'query' && u.searchParams.has(h.key)
      && (h.value === undefined || new RegExp(`^(?:${h.value})$`).test(u.searchParams.get(h.key) || '')));
    if (!hasOk) continue;
    let dest = r.destination;
    names.forEach((n, i) => { dest = dest.replace(`:${n}`, m[i + 1]); });
    const d = new URL(dest, 'http://x');
    u.searchParams.forEach((v, k) => { if (!d.searchParams.has(k)) d.searchParams.append(k, v); });
    const qs = d.searchParams.toString();
    return { location: d.pathname + (qs ? `?${qs}` : ''), permanent: r.permanent };
  }
  return null;
}
