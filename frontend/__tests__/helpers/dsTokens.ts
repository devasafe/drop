// Guardas de CSS do DS v2: hex fixo, token antigo (lista exata), tipografia v1 --fs-* e gradiente.
export const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
export const OLD_TOKEN_RE = /var\(--(?:drop-[a-z0-9-]+|brand(?:-2|-grad|-glow)?|bg(?:-radial)?|surface(?:-2|-field|-chip)?|line|divider|text(?:-strong|-muted|-subtle|-on-panel-muted)?|success|danger|info|rating|on-brand|accent-(?:soft|line|glow)|panel(?:-2|-grad)?|shadow-(?:brand|float|neutral)|scrim|r-(?:sm|md|lg|xl|2xl|pill)|dur-(?:fast|base|slow))\s*[,)]/;
export const FS_RE = /var\(--fs-[a-z0-9-]+/;
export const GRADIENT_RE = /gradient|glow/i;

/** Lista legível das violações de um CSS (vazia = ok). Comentários são ignorados. */
export function cssViolations(css: string): string[] {
  // troca cada comentário por quebras de linha equivalentes, preservando a numeração
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''));
  const out: string[] = [];
  clean.split('\n').forEach((line, i) => {
    if (HEX_RE.test(line) || OLD_TOKEN_RE.test(line) || FS_RE.test(line) || GRADIENT_RE.test(line)) {
      out.push(`${i + 1}: ${line.trim()}`);
    }
  });
  return out;
}
