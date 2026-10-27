/**
 * Ponte com o app Android (Capacitor, pasta `mobile/`). O app carrega este mesmo site; o
 * Capacitor injeta `window.Capacitor` e os plugins nativos. No navegador, tudo aqui é no-op.
 * Os plugins são importados sob demanda para não entrarem no bundle do site.
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  return !!cap?.isNativePlatform?.();
}
